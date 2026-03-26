# AI Task Processing Platform

A production-ready AI task processing platform built with MERN stack, Python worker, Docker, Kubernetes, and Argo CD (GitOps).

## Architecture

```
Frontend (React) → Backend API (Express) → MongoDB
                        ↓
                   Redis Queue → Python Worker(s)
```

**Services:**
- **Frontend**: React + Tailwind CSS (served via nginx)
- **Backend**: Node.js + Express (REST API, JWT auth)
- **Worker**: Python (async task processor, scalable)
- **Database**: MongoDB
- **Queue**: Redis

## Features

- User registration and login (JWT authentication)
- Create AI tasks (title, input text, operation)
- Supported operations: uppercase, lowercase, reverse string, word count
- Asynchronous task processing via Redis queue
- Real-time status tracking (pending → running → success/failed)
- Task logs and results
- Kubernetes deployment with Argo CD GitOps

## Quick Start (Docker Compose)

### Prerequisites
- Docker & Docker Compose
- Git

### Run Locally

```bash
# Clone the repository
git clone <repo-url>
cd ai-task-platform

# Start all services
docker-compose up --build

# Access the application
# Frontend: http://localhost:3000
# Backend API: http://localhost:5000
# MongoDB: localhost:27017
# Redis: localhost:6379
```

### Stop Services

```bash
docker-compose down
# To remove volumes:
docker-compose down -v
```

## Development Setup (Without Docker)

### Prerequisites
- Node.js 20+
- Python 3.12+
- MongoDB 7+
- Redis 7+

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your local MongoDB/Redis URLs
npm install
npm run dev
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm start
```

### Worker

```bash
cd worker
cp .env.example .env
pip install -r requirements.txt
python worker.py
```

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Register new user | No |
| POST | `/api/auth/login` | Login | No |
| GET | `/api/tasks` | List user tasks | Yes |
| POST | `/api/tasks` | Create new task | Yes |
| GET | `/api/tasks/:id` | Get task detail | Yes |
| POST | `/api/tasks/:id/run` | Run a task | Yes |
| GET | `/health` | Health check | No |
| GET | `/health/ready` | Readiness check | No |

## Kubernetes Deployment

### Prerequisites
- k3s or Kubernetes cluster
- kubectl configured
- Argo CD installed

### Manual Deployment

```bash
# Apply base manifests
kubectl apply -k k8s/base/

# Or use overlay for specific environment
kubectl apply -k k8s/overlays/staging/
kubectl apply -k k8s/overlays/production/
```

### Argo CD Deployment (Recommended)

```bash
# Install Argo CD
cd infra/argocd
chmod +x install.sh
./install.sh

# Access Argo CD UI
kubectl port-forward svc/argocd-server -n argocd 8443:443
# Open https://localhost:8443
```

## CI/CD Pipeline

The GitHub Actions pipeline runs on push to `main`:

1. **Lint**: ESLint (backend, frontend), flake8 (worker)
2. **Build**: Docker images with multi-stage builds
3. **Push**: Images to Docker Hub (tagged with git SHA)
4. **Deploy**: Updates image tags in infra repo → Argo CD auto-syncs

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `DOCKER_USERNAME` | Docker Hub username |
| `DOCKER_PASSWORD` | Docker Hub password/token |
| `INFRA_REPO_TOKEN` | GitHub PAT for infra repo access |

## Project Structure

```
ai-task-platform/
├── frontend/          # React + Tailwind CSS
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── src/
│   └── public/
├── backend/           # Express API
│   ├── Dockerfile
│   └── src/
│       ├── routes/
│       ├── models/
│       ├── middleware/
│       ├── config/
│       └── utils/
├── worker/            # Python worker
│   ├── Dockerfile
│   ├── worker.py
│   └── config.py
├── k8s/               # Kubernetes manifests
│   ├── base/
│   └── overlays/
│       ├── staging/
│       └── production/
├── infra/             # Infrastructure
│   └── argocd/
├── .github/workflows/ # CI/CD
├── docker-compose.yml
├── ARCHITECTURE.md
└── README.md
```

## Security

- Password hashing with bcrypt
- JWT-based authentication (24h expiry)
- Helmet middleware (security headers)
- Rate limiting (100 req/15min per IP)
- Non-root Docker containers
- No hardcoded secrets (environment variables)
- Kubernetes Secrets for sensitive data

## Scaling

- Workers scale horizontally (Redis BRPOP is multi-consumer safe)
- HPA based on queue depth and CPU utilization
- Staging: 1 replica per service
- Production: 3 backend, 2 frontend, 5+ workers
- See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed scaling strategy
