---
title: Deployment Guide
description: Deploy Lix Cache to production
---

Deploy Lix Cache to production using Docker, Kubernetes, Fly.io, or any platform that supports containerized applications.

## Prerequisites

- Docker installed (for containerized deployments)
- Elixir 1.17+ (for native deployments)
- 512 MB RAM minimum (1 GB+ recommended)
- 1 CPU core minimum (2+ recommended)

## Docker Deployment

### Build Docker Image

The Dockerfile is included in the repository:

```dockerfile
FROM elixir:1.17-alpine

WORKDIR /app
COPY . .

RUN mix local.hex --force && \
    mix local.rebar --force && \
    mix deps.get && \
    mix compile

ENV PORT=4000
ENV LIX_CACHE_LIMIT=100000

CMD ["mix", "run", "--no-halt"]
```

**Build the image:**

```bash
cd lix_cache_api
docker build -t lix-cache:latest .
```

### Run Container

```bash
docker run -d \
  --name lix-cache \
  -p 4000:4000 \
  -e LIX_CACHE_LIMIT=500000 \
  -e PORT=4000 \
  --restart unless-stopped \
  lix-cache:latest
```

**Verify it's running:**

```bash
curl http://localhost:4000/health
→ {"status": "healthy"}
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  cache:
    image: lix-cache:latest
    build:
      context: ./lix_cache_api
      dockerfile: Dockerfile
    ports:
      - "4000:4000"
    environment:
      LIX_CACHE_LIMIT: 500000
      PORT: 4000
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

**Start:**

```bash
docker-compose up -d
```

**Stop:**

```bash
docker-compose down
```

## Kubernetes Deployment

### Basic Deployment

Create `k8s/deployment.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: lix-cache
  labels:
    app: lix-cache
spec:
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: 4000
      protocol: TCP
  selector:
    app: lix-cache
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: lix-cache
  labels:
    app: lix-cache
spec:
  replicas: 3
  selector:
    matchLabels:
      app: lix-cache
  template:
    metadata:
      labels:
        app: lix-cache
    spec:
      containers:
        - name: lix-cache
          image: lix-cache:latest
          ports:
            - containerPort: 4000
              name: http
          env:
            - name: PORT
              value: "4000"
            - name: LIX_CACHE_LIMIT
              value: "500000"
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "2Gi"
              cpu: "2000m"
          livenessProbe:
            httpGet:
              path: /health
              port: 4000
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health
              port: 4000
            initialDelaySeconds: 5
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 2
```

**Deploy:**

```bash
kubectl apply -f k8s/deployment.yaml
```

**Check status:**

```bash
kubectl get pods -l app=lix-cache
kubectl get service lix-cache
```

**Scale:**

```bash
kubectl scale deployment lix-cache --replicas=5
```

### ConfigMap for Configuration

Create `k8s/configmap.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: lix-cache-config
data:
  PORT: "4000"
  LIX_CACHE_LIMIT: "500000"
```

Update deployment to use ConfigMap:

```yaml
spec:
  containers:
    - name: lix-cache
      envFrom:
        - configMapRef:
            name: lix-cache-config
```

## Fly.io Deployment

Fly.io is perfect for hobby projects and small production deployments.

### Setup

Install Fly CLI:

```bash
curl -L https://fly.io/install.sh | sh
```

Login:

```bash
fly auth login
```

### Create App

Create `fly.toml`:

```toml
app = "lix-cache"
primary_region = "sjc"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "4000"
  LIX_CACHE_LIMIT = "500000"

[[services]]
  internal_port = 4000
  protocol = "tcp"

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["http", "tls"]

  [services.concurrency]
    type = "connections"
    hard_limit = 1000
    soft_limit = 800

  [[services.tcp_checks]]
    interval = "15s"
    timeout = "2s"
    grace_period = "5s"

[http_service]
  http_checks = [
    {
      interval = 30000
      grace_period = "5s"
      method = "get"
      path = "/health"
      protocol = "http"
      timeout = 2000
      tls_skip_verify = false
    }
  ]
```

### Deploy

```bash
cd lix_cache_api
fly launch  # Create app (use fly.toml)
fly deploy  # Deploy
```

**Check status:**

```bash
fly status
fly logs
```

**Open in browser:**

```bash
fly open
```

### Scale on Fly.io

**Vertical scaling (increase VM size):**

```bash
fly scale vm shared-cpu-2x  # 2 CPUs, 4 GB RAM
```

**Horizontal scaling (add more instances):**

```bash
fly scale count 3  # Run 3 instances
```

## Railway Deployment

Railway provides simple deployment with automatic HTTPS.

### Setup

1. Install Railway CLI:
   ```bash
   npm install -g @railway/cli
   ```

2. Login:
   ```bash
   railway login
   ```

3. Initialize project:
   ```bash
   cd lix_cache_api
   railway init
   ```

4. Deploy:
   ```bash
   railway up
   ```

### Configuration

Add environment variables in Railway dashboard:
- `PORT` = 4000
- `LIX_CACHE_LIMIT` = 500000

Railway automatically assigns a public URL with HTTPS.

## Heroku Deployment

### Setup

Create `Procfile`:

```
web: mix run --no-halt
```

Create `elixir_buildpack.config`:

```
elixir_version=1.17.0
erlang_version=26.2.5
```

### Deploy

```bash
heroku create lix-cache-app
heroku buildpacks:add hashnuke/elixir
git push heroku main
heroku config:set LIX_CACHE_LIMIT=500000
heroku open
```

## AWS ECS Deployment

### Task Definition

Create `ecs-task-definition.json`:

```json
{
  "family": "lix-cache",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "lix-cache",
      "image": "your-registry/lix-cache:latest",
      "portMappings": [
        {
          "containerPort": 4000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "PORT",
          "value": "4000"
        },
        {
          "name": "LIX_CACHE_LIMIT",
          "value": "500000"
        }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:4000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 10
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/lix-cache",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### Deploy

```bash
# Register task definition
aws ecs register-task-definition --cli-input-json file://ecs-task-definition.json

# Create service
aws ecs create-service \
  --cluster your-cluster \
  --service-name lix-cache \
  --task-definition lix-cache \
  --desired-count 3 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx]}"
```

## Native Deployment (No Docker)

For maximum performance, deploy directly on the host.

### Install Elixir

**Ubuntu/Debian:**

```bash
wget https://packages.erlang-solutions.com/erlang-solutions_2.0_all.deb
sudo dpkg -i erlang-solutions_2.0_all.deb
sudo apt-get update
sudo apt-get install elixir
```

**macOS:**

```bash
brew install elixir
```

### Deploy

```bash
cd lix_cache_api
mix local.hex --force
mix local.rebar --force
mix deps.get
MIX_ENV=prod mix compile
```

### Run with Systemd

Create `/etc/systemd/system/lix-cache.service`:

```ini
[Unit]
Description=Lix Cache Service
After=network.target

[Service]
Type=simple
User=lix-cache
WorkingDirectory=/opt/lix_cache_api
Environment="PORT=4000"
Environment="LIX_CACHE_LIMIT=500000"
Environment="MIX_ENV=prod"
ExecStart=/usr/local/bin/mix run --no-halt
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**Enable and start:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable lix-cache
sudo systemctl start lix-cache
sudo systemctl status lix-cache
```

**View logs:**

```bash
sudo journalctl -u lix-cache -f
```

## Reverse Proxy Setup

### Nginx

```nginx
upstream lix_cache {
  server localhost:4000;
  keepalive 32;
}

server {
  listen 80;
  server_name cache.example.com;

  location / {
    proxy_pass http://lix_cache;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

    # Rate limiting
    limit_req zone=cache burst=100 nodelay;
  }

  # Health check (no rate limit)
  location /health {
    proxy_pass http://lix_cache;
    limit_req off;
  }
}

# Rate limit zone
limit_req_zone $binary_remote_addr zone=cache:10m rate=1000r/s;
```

### Caddy

```caddyfile
cache.example.com {
  reverse_proxy localhost:4000
}
```

Caddy automatically handles HTTPS with Let's Encrypt!

## Monitoring

### Prometheus Metrics

While Lix Cache doesn't export Prometheus metrics natively, you can scrape `/cache/stats`:

```yaml
scrape_configs:
  - job_name: 'lix-cache'
    metrics_path: '/cache/stats'
    static_configs:
      - targets: ['localhost:4000']
```

### Health Checks

**Docker:**
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1
```

**Kubernetes:**
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 4000
  initialDelaySeconds: 10
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health
    port: 4000
  initialDelaySeconds: 5
  periodSeconds: 5
```

### Logging

Set log level in production:

```bash
export LOG_LEVEL=info
mix run --no-halt
```

Log to file:

```bash
mix run --no-halt 2>&1 | tee -a /var/log/lix-cache.log
```

## Performance Tuning

### Environment Variables

```bash
# Cache capacity (items)
LIX_CACHE_LIMIT=1000000

# HTTP port
PORT=4000

# Elixir VM options
export ERL_FLAGS="+P 1000000"  # Max processes
export ELIXIR_ERL_OPTIONS="+K true"  # Kernel polling
```

### Resource Allocation

**Minimum:**
- 512 MB RAM
- 1 CPU core
- 10 GB disk (for Docker images)

**Recommended:**
- 2 GB RAM
- 2 CPU cores
- 20 GB disk

**High traffic:**
- 4-8 GB RAM
- 4-8 CPU cores
- 50 GB disk

## Security

### Network Security

- Run behind firewall or security group
- Only expose port 4000 (or your configured port)
- Use TLS termination at reverse proxy (nginx, Caddy)
- Consider VPC/private networking for internal services

### Rate Limiting

Implement at reverse proxy level (see Nginx example above).

### Authentication

Lix Cache has no built-in authentication. Options:

1. **Network isolation** - Only allow internal traffic
2. **API Gateway** - Use Kong, Tyk, or AWS API Gateway
3. **Reverse proxy auth** - nginx basic auth or OAuth2 proxy

## Backup and Recovery

### Data Persistence

Lix Cache is an **in-memory cache** - data is lost on restart. This is intentional!

**If you need persistence:**
- Use Redis or Memcached instead
- Or keep source of truth in database (cache-aside pattern)

### State Management

Cache should be **stateless and ephemeral**:
- No backups needed
- Restart anytime without data loss concerns
- Scale horizontally without state migration

## Troubleshooting

### High Memory Usage

Check cache size:
```bash
curl http://localhost:4000/cache/stats
```

Reduce limit:
```bash
docker restart lix-cache -e LIX_CACHE_LIMIT=50000
```

### Connection Issues

Check health:
```bash
curl http://localhost:4000/health
```

Check logs:
```bash
docker logs lix-cache
kubectl logs -l app=lix-cache
```

### Performance Issues

Check stats for hit rate:
```bash
curl http://localhost:4000/cache/stats
```

Low hit rate means:
- TTLs too short
- Cache too small
- Keys not reused

## Next Steps

- [Backend Architecture](/backend/architecture/) - Understand the internals
- [API Endpoints](/backend/endpoints/) - Full API reference
- [Configuration](/getting-started/configuration/) - Configure server and client
