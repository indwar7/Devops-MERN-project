#!/usr/bin/env python3
"""AI Task Processing Platform -- Worker Service.

Listens on a Redis list (``task_queue``) via BRPOP, processes incoming task
payloads, persists results to MongoDB, and exposes a lightweight HTTP health
endpoint for orchestrators such as Kubernetes.

The worker is fully stateless and safe to run as multiple replicas -- Redis
BRPOP guarantees that each task is delivered to exactly one consumer.
"""

from __future__ import annotations

import json
import logging
import signal
import socket
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Dict, Optional

import redis
from bson import ObjectId
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, PyMongoError

import config

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S%z",
)
logger = logging.getLogger("worker")

# ---------------------------------------------------------------------------
# Globals for graceful shutdown
# ---------------------------------------------------------------------------
_shutdown_event = threading.Event()


# ---------------------------------------------------------------------------
# Health-check HTTP server (runs in a daemon thread)
# ---------------------------------------------------------------------------
class _HealthHandler(BaseHTTPRequestHandler):
    """Minimal handler that responds 200 on GET /healthz."""

    # Shared mutable state -- set by the main thread.
    ready: bool = False

    def do_GET(self) -> None:  # noqa: N802 -- method name required by stdlib
        if self.path in ("/health", "/healthz") and _HealthHandler.ready:
            self._respond(200, {"status": "healthy"})
        elif self.path in ("/health", "/healthz"):
            self._respond(503, {"status": "not_ready"})
        else:
            self._respond(404, {"error": "not_found"})

    def _respond(self, code: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        """Silence per-request logs to avoid noise."""


def _start_health_server(port: int) -> HTTPServer:
    server = HTTPServer(("0.0.0.0", port), _HealthHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    logger.info("Health-check server listening on :%d/healthz", port)
    return server


# ---------------------------------------------------------------------------
# Connection helpers with retry / back-off
# ---------------------------------------------------------------------------
def _connect_redis() -> redis.Redis:
    """Return a connected Redis client, retrying on failure."""
    attempt = 0
    while not _shutdown_event.is_set():
        attempt += 1
        try:
            client = redis.Redis.from_url(
                config.REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_keepalive=True,
            )
            client.ping()
            logger.info("Connected to Redis at %s", config.REDIS_URL)
            return client
        except (redis.ConnectionError, redis.TimeoutError) as exc:
            _log_retry("Redis", attempt, exc)
    # If we reach here the worker is shutting down.
    sys.exit(0)


def _connect_mongo() -> MongoClient:
    """Return a connected MongoClient, retrying on failure."""
    attempt = 0
    while not _shutdown_event.is_set():
        attempt += 1
        try:
            client = MongoClient(
                config.MONGO_URI,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000,
            )
            # Force a connection check.
            client.admin.command("ping")
            logger.info("Connected to MongoDB at %s", config.MONGO_URI)
            return client
        except ConnectionFailure as exc:
            _log_retry("MongoDB", attempt, exc)
    sys.exit(0)


def _log_retry(service: str, attempt: int, exc: Exception) -> None:
    if config.MAX_RETRY_ATTEMPTS and attempt >= config.MAX_RETRY_ATTEMPTS:
        logger.critical(
            "Exceeded %d connection attempts to %s -- exiting",
            config.MAX_RETRY_ATTEMPTS,
            service,
        )
        sys.exit(1)
    backoff = min(config.RETRY_BACKOFF_BASE ** attempt, config.RETRY_BACKOFF_MAX)
    logger.warning(
        "%s connection attempt %d failed (%s). Retrying in %.1fs ...",
        service,
        attempt,
        exc,
        backoff,
    )
    _shutdown_event.wait(timeout=backoff)


# ---------------------------------------------------------------------------
# Task operations
# ---------------------------------------------------------------------------
OPERATIONS: Dict[str, Any] = {
    "uppercase": lambda text: text.upper(),
    "lowercase": lambda text: text.lower(),
    "reverse": lambda text: text[::-1],
    "wordcount": lambda text: str(len(text.split())),
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _make_log_entry(message: str, level: str = "info") -> dict:
    return {
        "timestamp": _utcnow().isoformat(),
        "level": level,
        "message": message,
        "worker": socket.gethostname(),
    }


# ---------------------------------------------------------------------------
# MongoDB helpers
# ---------------------------------------------------------------------------
def _update_task(
    collection,
    task_id: str,
    *,
    status: Optional[str] = None,
    result: Optional[str] = None,
    log_message: Optional[str] = None,
    log_level: str = "info",
    error: Optional[str] = None,
) -> None:
    """Atomically update a task document in MongoDB."""
    update: Dict[str, Any] = {"$set": {"updatedAt": _utcnow()}}
    if status:
        update["$set"]["status"] = status
    if result is not None:
        update["$set"]["result"] = result
    if error is not None:
        update["$set"]["error"] = error
    if log_message:
        update.setdefault("$push", {})["logs"] = _make_log_entry(log_message, log_level)

    try:
        object_id = ObjectId(task_id)
    except Exception:
        object_id = task_id  # fall back to raw string if not a valid ObjectId

    collection.update_one({"_id": object_id}, update)


# ---------------------------------------------------------------------------
# Process a single task
# ---------------------------------------------------------------------------
def _process_task(collection, payload: str) -> None:
    """Parse *payload*, execute the operation, and persist results."""
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:
        logger.error("Invalid JSON payload: %s -- %s", payload, exc)
        return

    task_id: Optional[str] = data.get("taskId")
    operation: Optional[str] = data.get("operation")
    input_text: Optional[str] = data.get("inputText")

    if not task_id:
        logger.error("Payload missing 'taskId': %s", data)
        return

    logger.info("Processing task %s (operation=%s)", task_id, operation)

    # Mark as running ---------------------------------------------------------
    _update_task(
        collection,
        task_id,
        status="running",
        log_message=f"Worker {socket.gethostname()} picked up the task",
    )

    # Validate ----------------------------------------------------------------
    if operation not in OPERATIONS:
        msg = f"Unsupported operation: {operation!r}"
        logger.warning("Task %s failed -- %s", task_id, msg)
        _update_task(
            collection,
            task_id,
            status="failed",
            error=msg,
            log_message=msg,
            log_level="error",
        )
        return

    if input_text is None:
        msg = "Missing 'inputText' in payload"
        logger.warning("Task %s failed -- %s", task_id, msg)
        _update_task(
            collection,
            task_id,
            status="failed",
            error=msg,
            log_message=msg,
            log_level="error",
        )
        return

    # Execute -----------------------------------------------------------------
    try:
        result = OPERATIONS[operation](input_text)
    except Exception as exc:
        msg = f"Operation {operation!r} raised an exception: {exc}"
        logger.exception("Task %s failed -- %s", task_id, msg)
        _update_task(
            collection,
            task_id,
            status="failed",
            error=msg,
            log_message=msg,
            log_level="error",
        )
        return

    # Persist result ----------------------------------------------------------
    _update_task(
        collection,
        task_id,
        status="success",
        result=result,
        log_message=f"Operation '{operation}' completed successfully",
    )
    logger.info("Task %s completed successfully", task_id)


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
def _main_loop(redis_client: redis.Redis, collection) -> None:
    """Block on BRPOP and process tasks until shutdown."""
    while not _shutdown_event.is_set():
        try:
            item = redis_client.brpop(config.TASK_QUEUE, timeout=config.BRPOP_TIMEOUT)
        except (redis.ConnectionError, redis.TimeoutError) as exc:
            logger.warning("Redis error during BRPOP: %s -- reconnecting ...", exc)
            # Attempt to reconnect; _connect_redis handles retries internally.
            redis_client = _connect_redis()
            continue

        if item is None:
            # BRPOP timed out -- loop back and check shutdown flag.
            continue

        _queue_name, payload = item

        try:
            _process_task(collection, payload)
        except PyMongoError as exc:
            logger.error("MongoDB error while processing task: %s", exc)
            # The payload is already dequeued; log and continue so we don't
            # crash the worker.  A monitoring alert should fire on this.
        except Exception:
            logger.exception("Unexpected error while processing task")


# ---------------------------------------------------------------------------
# Signal handling
# ---------------------------------------------------------------------------
def _handle_signal(signum: int, _frame) -> None:
    name = signal.Signals(signum).name
    logger.info("Received %s -- initiating graceful shutdown ...", name)
    _shutdown_event.set()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main() -> None:
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    logger.info("Worker starting on host %s", socket.gethostname())

    # Start health-check endpoint ---------------------------------------------
    health_server = _start_health_server(config.WORKER_HEALTH_PORT)

    # Connect to backing services ---------------------------------------------
    redis_client = _connect_redis()
    mongo_client = _connect_mongo()
    db = mongo_client[config.MONGO_DB_NAME]
    collection = db[config.MONGO_COLLECTION]

    # Mark as ready for liveness probes ---------------------------------------
    _HealthHandler.ready = True
    logger.info(
        "Worker ready -- listening on Redis queue %r", config.TASK_QUEUE
    )

    # Run the blocking main loop ----------------------------------------------
    try:
        _main_loop(redis_client, collection)
    finally:
        logger.info("Shutting down ...")
        _HealthHandler.ready = False
        health_server.shutdown()
        redis_client.close()
        mongo_client.close()
        logger.info("Worker stopped cleanly.")


if __name__ == "__main__":
    main()
