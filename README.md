# AI Task Processing Platform

A production-ready, microservices-based AI task processing platform built with the MERN stack, Python worker, Docker, Kubernetes (k3s-compatible), Argo CD (GitOps), and GitHub Actions CI/CD.

## System Architecture

```
                          ┌──────────────────┐
                          │   React Frontend  │
                          │  (Tailwind + Nginx)│
                          └────────┬─────────┘
                                   │ HTTP
                          ┌────────▼─────────┐
                          │  Express Backend  │
                          │  (JWT + Helmet)   │
                          └───┬──────────┬───┘
                              │          │
                    ┌─────────▼──┐  ┌────▼────────┐
                    │  MongoDB   │  │    Redis     │
                    │ (Database) │  │   (Queue)    │
                    └────────────┘  └────┬────────┘
                                         │ BRPOP
                              ┌──────────▼─────────┐
                              │   Python Worker(s)  │
                              │  (Horizontally      │
                              │   Scalable)         │
                              └────────────────────┘
```

### Services

| Service | Technology | Port | Purpose |
|---------|-----------|------|---------|
| Frontend | React 18, Tailwind CSS, Nginx | 3000 (host) → 8080 (container) | User interface |
| Backend | Node.js 20, Express 4, Mongoose | 5001 (host) → 5000 (container) | REST API, Auth |
| Worker | Python 3.12, PyMongo, Redis-py | 8080 (health only) | Async task processor |
| Database | MongoDB 7 | 27017 | Data persistence |
| Queue | Redis 7 | 6379 | Job queue (BRPOP) |

## Features

- **Authentication**: User registration and login with JWT (24h expiry) and bcrypt password hashing
- **Task Management**: Create AI tasks with title, input text, and operation selection
- **Supported Operations**: `uppercase`, `lowercase`, `reverse`, `wordcount`
- **Async Processing**: Tasks queued in Redis, processed by Python workers in background
- **Real-time Tracking**: Status updates (pending → running → success/failed) with auto-refresh
- **Task Logs**: Timestamped log entries with worker hostname for traceability
- **Security**: Helmet headers, rate limiting (100 req/15min), no hardcoded secrets, non-root containers

## Quick Start

### Prerequisites
- Docker Desktop (with Docker Compose v2)
- Git

### 1. Clone and Run

```bash
git clone https://github.com/indwar7/ai-task-platform.git
cd ai-task-platform
docker compose up --build -d
```

### 2. Access the Application

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5001/api |
| Health Check | http://localhost:5001/health |

### 3. Usage

1. Open http://localhost:3000
2. Click **Register** to create an account
3. Navigate to **Tasks** → **New Task**
4. Enter a title, input text, and select an operation
5. Click **Create** — the task is automatically queued and processed
6. Watch the status change from `pending` → `running` → `success`
7. View the result and processing logs on the task detail page

### 4. Stop Services

```bash
docker compose down          # Stop containers
docker compose down -v       # Stop and remove volumes
```

## Development Setup (Without Docker)

### Prerequisites
- Node.js 20+, Python 3.12+, MongoDB 7+, Redis 7+

```bash
# Terminal 1 — Backend
cd backend && cp .env.example .env && npm install && npm run dev

# Terminal 2 — Frontend
cd frontend && cp .env.example .env && npm install && npm start

# Terminal 3 — Worker
cd worker && cp .env.example .env && pip install -r requirements.txt && python worker.py
```

## API Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|:---:|
| `POST` | `/api/auth/register` | Register new user | No |
| `POST` | `/api/auth/login` | Login and receive JWT | No |
| `GET` | `/api/tasks` | List user tasks (paginated) | Yes |
| `POST` | `/api/tasks` | Create and queue a new task | Yes |
| `GET` | `/api/tasks/:id` | Get task detail with logs | Yes |
| `POST` | `/api/tasks/:id/run` | Re-run a task | Yes |
| `GET` | `/health` | Liveness probe (MongoDB + Redis) | No |
| `GET` | `/health/ready` | Readiness probe | No |

## Docker

Each service has its own **multi-stage Dockerfile** with:
- Minimal base images (Alpine/Slim)
- Non-root user (`appuser:1001`)
- Built-in `HEALTHCHECK` instructions
- Production-optimized builds

```
frontend/Dockerfile  → Build React → Serve with Nginx
backend/Dockerfile   → Install deps → Run Node.js
worker/Dockerfile    → Install pip deps → Run Python
```

## Kubernetes Deployment

All manifests are in `k8s/` using **Kustomize** with base + overlays pattern.

### Features
- Dedicated namespace (`ai-task-platform`)
- Deployments with resource limits and requests
- Liveness and readiness probes for all services
- ConfigMaps and Secrets for configuration
- Ingress with nginx controller
- Worker supports horizontal scaling (3 replicas default, up to 20 with HPA)

### Deploy

```bash
# Staging (1 replica each)
kubectl apply -k k8s/overlays/staging/

# Production (3 backend, 2 frontend, 5 workers)
kubectl apply -k k8s/overlays/production/
```

### Environment Strategy

| Environment | Namespace | Workers | Domain |
|-------------|-----------|---------|--------|
| Staging | `ai-task-platform-staging` | 1 | `staging.ai-task.local` |
| Production | `ai-task-platform-production` | 5 | `ai-task.production.example.com` |

## GitOps with Argo CD

```bash
cd infra/argocd
chmod +x install.sh
./install.sh
```

This will:
1. Install Argo CD on the cluster
2. Create Application resources for staging and production
3. Enable **auto-sync** with self-heal on git repository changes

Access Argo CD UI:
```bash
kubectl port-forward svc/argocd-server -n argocd 8443:443
# Open https://localhost:8443 (user: admin)
```

## CI/CD Pipeline (GitHub Actions)

The pipeline (`.github/workflows/ci-cd.yaml`) runs on push to `main`:

```
Push to main
  ├── Lint (parallel)
  │   ├── ESLint — Backend
  │   ├── ESLint — Frontend
  │   └── Flake8 — Worker
  ├── Build & Push Docker Images (parallel matrix)
  │   ├── backend  → docker.io/<user>/ai-task-backend:<sha>
  │   ├── frontend → docker.io/<user>/ai-task-frontend:<sha>
  │   └── worker   → docker.io/<user>/ai-task-worker:<sha>
  └── Update Infra Repo (image tags)
        └── Argo CD auto-syncs → Kubernetes updated
```

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `DOCKER_USERNAME` | Docker Hub username |
| `DOCKER_PASSWORD` | Docker Hub access token |
| `INFRA_REPO_TOKEN` | GitHub PAT for infra repo write access |

## Security Checklist

- [x] Password hashing with bcrypt (12 salt rounds)
- [x] JWT-based authentication (24h token expiry)
- [x] Helmet middleware (security headers)
- [x] Rate limiting (100 requests per 15 minutes per IP)
- [x] Input validation with express-validator
- [x] No hardcoded secrets (environment variables + K8s Secrets)
- [x] Non-root Docker containers (UID 1001)
- [x] CORS configuration
- [x] Password field excluded from API responses (`select: false`)

## Project Structure

```
ai-task-platform/
├── frontend/                  # React + Tailwind CSS
│   ├── Dockerfile             # Multi-stage: build → nginx
│   ├── nginx.conf             # Reverse proxy config
│   ├── src/
│   │   ├── components/        # Navbar, StatusBadge, TaskForm, PrivateRoute
│   │   ├── pages/             # Login, Register, Dashboard, Tasks, TaskDetail
│   │   ├── context/           # AuthContext (JWT state management)
│   │   └── services/          # Axios API client
│   └── public/
├── backend/                   # Node.js + Express API
│   ├── Dockerfile             # Multi-stage: deps → runtime
│   └── src/
│       ├── routes/            # auth.js, tasks.js
│       ├── models/            # User.js (bcrypt), Task.js (indexed)
│       ├── middleware/         # auth.js (JWT), validate.js
│       ├── config/            # db.js (Mongo), redis.js (ioredis)
│       └── utils/             # queue.js (Redis LPUSH)
├── worker/                    # Python background processor
│   ├── Dockerfile             # Multi-stage: pip → runtime
│   ├── worker.py              # BRPOP loop, graceful shutdown, health server
│   └── config.py              # Env-based configuration
├── k8s/                       # Kubernetes manifests
│   ├── base/                  # Shared: namespace, deployments, services,
│   │                          #   ingress, configmap, secrets, probes
│   └── overlays/
│       ├── staging/           # 1 replica per service
│       └── production/        # Scaled replicas, prod domain
├── infra/argocd/              # Argo CD application manifests + install script
├── .github/workflows/         # CI/CD pipeline
│   └── ci-cd.yaml
├── docker-compose.yml         # Local development (all 5 services)
├── ARCHITECTURE.md            # Architecture document (scaling, indexing, failure handling)
└── README.md
```

## Architecture Document

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed coverage of:

1. **Worker Scaling Strategy** — HPA based on Redis queue depth, BRPOP multi-consumer safety
2. **High Volume Handling (100k tasks/day)** — Throughput analysis, connection pooling, write optimization
3. **Database Indexing Strategy** — Compound indexes, query patterns, maintenance
4. **Redis Failure Handling** — Detection, retry logic, recovery jobs, upgrade path
5. **Staging/Production Deployment** — Kustomize overlays, Argo CD GitOps, rollback strategy
