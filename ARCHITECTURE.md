# AI Task Processing Platform - Architecture Document

## 1. System Overview

The AI Task Processing Platform is a distributed system built with microservices architecture. It consists of four primary services: a React frontend, a Node.js/Express backend API, a Python worker service, and supporting infrastructure (MongoDB, Redis).

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│  Backend API │────▶│    MongoDB    │
│   (React)    │     │  (Express)   │     │              │
└──────────────┘     └──────┬───────┘     └──────▲───────┘
                            │                     │
                            ▼                     │
                     ┌──────────────┐     ┌──────┴───────┐
                     │    Redis     │────▶│   Worker(s)   │
                     │   (Queue)   │     │   (Python)    │
                     └──────────────┘     └──────────────┘
```

### Request Flow
1. User submits a task via the React frontend
2. Backend API validates the request, creates a task record (status: `pending`) in MongoDB
3. Backend pushes a job message to the Redis queue (`task_queue` list)
4. Worker service picks up the job via `BRPOP` (blocking pop)
5. Worker updates task status to `running`, processes the operation, saves result
6. Worker sets final status to `success` or `failed`
7. Frontend polls for status updates and displays results

---

## 2. Worker Scaling Strategy

### Horizontal Pod Autoscaler (HPA)
Workers are stateless and designed for horizontal scaling. Each worker independently consumes from the shared Redis queue using `BRPOP`, which guarantees exactly-once delivery per message.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: worker-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: worker
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: External
      external:
        metric:
          name: redis_queue_length
        target:
          type: AverageValue
          averageValue: "50"
```

### Scaling Triggers
- **Queue depth**: Scale up when `task_queue` length exceeds 50 messages per worker
- **CPU utilization**: Secondary trigger at 70% CPU
- **Cooldown**: 60s scale-up, 300s scale-down to avoid thrashing

### Why BRPOP Works for Multi-Replica
Redis `BRPOP` is atomic - only one consumer receives each message. This eliminates the need for distributed locking or message acknowledgment complexity. If a worker crashes mid-processing, the task remains in `running` status and can be recovered by a periodic cleanup job.

---

## 3. Handling High Task Volume (100k tasks/day)

### Throughput Analysis
- 100,000 tasks/day = ~1.16 tasks/second average
- Assuming peak 10x = ~12 tasks/second burst
- Each text operation completes in <100ms
- Single worker handles ~10 tasks/second
- **Minimum 2 workers** for sustained load, **5+ workers** for peak burst

### Optimizations for High Volume

#### Backend API
- **Connection pooling**: Mongoose connection pool (default: 5 connections per pod)
- **Rate limiting**: 100 req/15min per IP prevents abuse
- **Bulk operations**: API supports pagination to avoid large result sets

#### Redis Queue
- Redis handles >100,000 operations/second on a single instance
- Queue depth of 100k is well within Redis memory limits (~50MB for task payloads)
- **TTL on completed messages**: Processed tasks are not re-queued

#### MongoDB Write Optimization
- Workers use `findOneAndUpdate` for atomic status transitions
- Bulk write operations for log entries
- Write concern `w:1` for task updates (availability over strict consistency)

#### Architecture Scaling Path
```
Load Level        Workers    Backend Pods    Notes
─────────────────────────────────────────────────────
<10k/day          2          1               Base deployment
10k-50k/day       3-5        2               HPA engaged
50k-100k/day      5-10       3               Monitor queue depth
100k-500k/day     10-20      5               Consider Redis Cluster
>500k/day         20+        10+             Add Redis Sentinel, MongoDB replica set
```

---

## 4. Database Indexing Strategy

### Task Collection Indexes
```javascript
// Compound index for user task listing (most common query)
{ userId: 1, createdAt: -1 }

// Status-based queries for dashboard and monitoring
{ status: 1, createdAt: -1 }

// Single field for task lookup
{ _id: 1 }  // default

// TTL index for automatic cleanup (optional)
{ createdAt: 1 }, { expireAfterSeconds: 7776000 }  // 90 days
```

### User Collection Indexes
```javascript
// Unique email for login lookups
{ email: 1 }, { unique: true }
```

### Query Patterns
| Query | Index Used | Frequency |
|-------|-----------|-----------|
| Get user's tasks (paginated) | `{userId, createdAt}` | Very High |
| Get task by ID | `{_id}` | High |
| Count tasks by status | `{status, createdAt}` | Medium |
| Worker status update | `{_id}` | High |

### Index Maintenance
- Monitor slow queries via MongoDB profiler (`db.setProfilingLevel(1, {slowms: 100})`)
- Review index usage monthly with `db.collection.aggregate([{$indexStats:{}}])`
- Avoid over-indexing: each index adds ~10% write overhead

---

## 5. Handling Redis Failure

### Detection
- Backend health check (`/health`) verifies Redis connectivity
- Kubernetes readiness probe fails if Redis is unreachable
- Worker health endpoint checks Redis connection on each poll

### Failure Modes and Mitigation

#### Scenario 1: Redis Temporarily Unavailable (network blip)
- **Worker**: Retry connection with exponential backoff (1s, 2s, 4s, 8s... max 60s)
- **Backend**: Return HTTP 503 for task creation, existing tasks remain accessible from MongoDB
- **Recovery**: Automatic reconnection; no data loss since task records exist in MongoDB

#### Scenario 2: Redis Crashes and Restarts (data loss)
- Tasks already in `pending` status in MongoDB but lost from queue
- **Recovery job**: Periodic cron (every 5 minutes) queries MongoDB for tasks with `status: pending` older than 2 minutes and re-queues them
- No duplicate processing because worker checks current status before processing

#### Scenario 3: Redis Persistent Failure
- Backend continues serving read operations (task listing, results)
- New task creation returns error with clear message
- Alert triggers via Kubernetes pod restart count / health check failures
- **Upgrade path**: Redis Sentinel for automatic failover in production

### Redis Persistence Configuration
```
# redis.conf for production
appendonly yes
appendfsync everysec
maxmemory 256mb
maxmemory-policy allkeys-lru
```

---

## 6. Staging and Production Deployment

### Environment Strategy
We use Kustomize overlays with Argo CD for GitOps-based deployment.

```
k8s/
├── base/                    # Shared manifests
│   ├── namespace.yaml
│   ├── backend.yaml
│   ├── frontend.yaml
│   ├── worker.yaml
│   ├── mongodb.yaml
│   ├── redis.yaml
│   ├── configmap.yaml
│   ├── secrets.yaml
│   └── ingress.yaml
├── overlays/
│   ├── staging/             # 1 replica each, staging domain
│   └── production/          # 3+ replicas, production domain
```

### Deployment Pipeline

```
Developer Push → GitHub Actions CI/CD
    ├── Lint (backend, frontend, worker)
    ├── Build Docker images
    ├── Push to Docker Hub (tagged with git SHA)
    └── Update image tag in infra repo
            ↓
Argo CD detects infra repo change
    ├── Syncs staging automatically
    └── Syncs production automatically (or manual approval)
```

### Staging Environment
- **Namespace**: `ai-task-platform-staging`
- **Replicas**: 1 per service (cost-efficient)
- **Domain**: `staging.ai-task.local`
- **Auto-sync**: Enabled - deploys on every infra repo commit
- **Purpose**: Integration testing, QA validation

### Production Environment
- **Namespace**: `ai-task-platform-production`
- **Replicas**: Backend 3, Frontend 2, Worker 5
- **Domain**: `ai-task.production.example.com`
- **Auto-sync**: Enabled with self-heal
- **Secrets**: Managed via Sealed Secrets or external secrets operator
- **Monitoring**: Prometheus metrics, Grafana dashboards

### Rollback Strategy
- Argo CD maintains deployment history
- Rollback via `argocd app rollback <app-name>` or UI
- Git revert on infra repo triggers automatic rollback
- Blue/green deployment possible by maintaining two overlay directories

### Production Hardening Checklist
- [ ] Replace `stringData` secrets with Sealed Secrets
- [ ] Enable MongoDB replica set (3 nodes)
- [ ] Enable Redis Sentinel (3 nodes)
- [ ] Configure PodDisruptionBudgets
- [ ] Set up NetworkPolicies
- [ ] Enable TLS on Ingress
- [ ] Configure backup CronJob for MongoDB
