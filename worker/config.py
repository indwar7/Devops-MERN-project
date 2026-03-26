"""Configuration loaded from environment variables with sensible defaults."""

import os

from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# MongoDB
# ---------------------------------------------------------------------------
MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017/ai_task_platform")
MONGO_DB_NAME: str = os.getenv("MONGO_DB_NAME", "ai_task_platform")
MONGO_COLLECTION: str = os.getenv("MONGO_COLLECTION", "tasks")

# ---------------------------------------------------------------------------
# Redis
# ---------------------------------------------------------------------------
REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
TASK_QUEUE: str = os.getenv("TASK_QUEUE", "task_queue")
BRPOP_TIMEOUT: int = int(os.getenv("BRPOP_TIMEOUT", "5"))

# ---------------------------------------------------------------------------
# Worker
# ---------------------------------------------------------------------------
WORKER_HEALTH_PORT: int = int(os.getenv("WORKER_HEALTH_PORT", "8080"))

# Maximum number of consecutive connection-retry attempts before the worker
# exits.  Set to 0 for unlimited retries.
MAX_RETRY_ATTEMPTS: int = int(os.getenv("MAX_RETRY_ATTEMPTS", "0"))
RETRY_BACKOFF_BASE: float = float(os.getenv("RETRY_BACKOFF_BASE", "2.0"))
RETRY_BACKOFF_MAX: float = float(os.getenv("RETRY_BACKOFF_MAX", "60.0"))
