# Lix Cache Deployment Guide

This guide covers deploying Lix Cache to production environments.

## Table of Contents

- [Quick Start](#quick-start)
- [Docker Compose](#docker-compose)
- [Kubernetes](#kubernetes)
- [Platform-Specific Guides](#platform-specific-guides)
  - [Fly.io](#flyio)
  - [Railway](#railway)
  - [Render](#render)
  - [AWS ECS/Fargate](#aws-ecsfargate)
  - [Digital Ocean](#digital-ocean)
- [Configuration](#configuration)
- [Monitoring](#monitoring)
- [Scaling](#scaling)
- [Security](#security)

## Quick Start

The fastest way to deploy Lix Cache:

```bash
docker run -d \
  --name lix-cache \
  -p 4000:4000 \
  -e PORT=4000 \
  -e CACHE_LIMIT=100000 \
  --restart unless-stopped \
  lixcache/server:latest
```

## Docker Compose

### Simple Production Setup

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  lix-cache:
    image: lixcache/server:latest
    container_name: lix-cache
    ports:
      - "4000:4000"
    environment:
      - PORT=4000
      - CACHE_LIMIT=100000
      - MIX_ENV=prod
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:4000/health"]
      interval: 30s
      timeout: 3s
      retries: 3
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 1G
        reservations:
          cpus: '1.0'
          memory: 512M
```

Deploy:

```bash
docker-compose up -d
```

### With Reverse Proxy (nginx)

`docker-compose.yml`:

```yaml
version: '3.8'

services:
  lix-cache:
    image: lixcache/server:latest
    container_name: lix-cache
    expose:
      - "4000"
    environment:
      - PORT=4000
      - CACHE_LIMIT=100000
    restart: unless-stopped
    networks:
      - lix-network

  nginx:
    image: nginx:alpine
    container_name: lix-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - lix-cache
    restart: unless-stopped
    networks:
      - lix-network

networks:
  lix-network:
    driver: bridge
```

`nginx.conf`:

```nginx
http {
  upstream lix-cache {
    server lix-cache:4000;
  }

  server {
    listen 80;
    server_name cache.example.com;

    location / {
      proxy_pass http://lix-cache;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
      proxy_pass http://lix-cache;
      access_log off;
    }
  }
}
```

## Kubernetes

### Basic Deployment

`k8s/deployment.yaml`:

```yaml
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
        image: lixcache/server:latest
        ports:
        - containerPort: 4000
          name: http
        env:
        - name: PORT
          value: "4000"
        - name: CACHE_LIMIT
          value: "100000"
        - name: MIX_ENV
          value: "prod"
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 2000m
            memory: 1Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 4000
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 4000
          initialDelaySeconds: 5
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: lix-cache
spec:
  selector:
    app: lix-cache
  ports:
  - port: 80
    targetPort: 4000
    protocol: TCP
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: lix-cache-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - cache.example.com
    secretName: lix-cache-tls
  rules:
  - host: cache.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: lix-cache
            port:
              number: 80
```

Deploy:

```bash
kubectl apply -f k8s/deployment.yaml
```

### With HorizontalPodAutoscaler

`k8s/hpa.yaml`:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: lix-cache-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: lix-cache
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

## Platform-Specific Guides

### Fly.io

Fly.io is perfect for Elixir applications. Create `fly.toml`:

```toml
app = "lix-cache"
primary_region = "sjc"

[build]
  image = "lixcache/server:latest"

[env]
  PORT = "8080"
  CACHE_LIMIT = "100000"
  MIX_ENV = "prod"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

[[services]]
  internal_port = 8080
  protocol = "tcp"

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [[services.http_checks]]
    interval = "30s"
    timeout = "10s"
    grace_period = "5s"
    method = "GET"
    path = "/health"

[resources]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512
```

Deploy:

```bash
fly launch
fly deploy
```

### Railway

1. Create a new project on Railway
2. Add a new service
3. Select "Docker Image"
4. Enter: `lixcache/server:latest`
5. Add environment variables:
   - `PORT=4000`
   - `CACHE_LIMIT=100000`
6. Railway will auto-generate a URL

Or use Railway CLI:

```bash
railway init
railway up
```

### Render

Create `render.yaml`:

```yaml
services:
  - type: web
    name: lix-cache
    env: docker
    image:
      url: lixcache/server:latest
    envVars:
      - key: PORT
        value: 4000
      - key: CACHE_LIMIT
        value: 100000
    healthCheckPath: /health
    plan: starter
    numInstances: 1
```

Deploy via Render Dashboard or CLI:

```bash
render deploy
```

### AWS ECS/Fargate

1. Push image to ECR:

```bash
aws ecr create-repository --repository-name lix-cache
docker tag lixcache/server:latest <account-id>.dkr.ecr.<region>.amazonaws.com/lix-cache:latest
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/lix-cache:latest
```

2. Create task definition (`task-definition.json`):

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
      "image": "<account-id>.dkr.ecr.<region>.amazonaws.com/lix-cache:latest",
      "portMappings": [
        {
          "containerPort": 4000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        { "name": "PORT", "value": "4000" },
        { "name": "CACHE_LIMIT", "value": "100000" }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 10
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/lix-cache",
          "awslogs-region": "<region>",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

3. Create service:

```bash
aws ecs create-service \
  --cluster my-cluster \
  --service-name lix-cache \
  --task-definition lix-cache \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"
```

### Digital Ocean

Using Digital Ocean App Platform:

1. Go to App Platform
2. Create New App
3. Choose Docker Hub
4. Enter: `lixcache/server`
5. Configure:
   - Port: 4000
   - Environment Variables:
     - `PORT=4000`
     - `CACHE_LIMIT=100000`
6. Choose plan (Basic $5/mo recommended for start)
7. Deploy

Or use `doctl`:

```bash
doctl apps create --spec app-spec.yaml
```

`app-spec.yaml`:

```yaml
name: lix-cache
services:
- name: web
  image:
    registry_type: DOCKER_HUB
    repository: lixcache/server
    tag: latest
  http_port: 4000
  instance_count: 1
  instance_size_slug: basic-xxs
  env_vars:
  - key: PORT
    value: "4000"
  - key: CACHE_LIMIT
    value: "100000"
  health_check:
    http_path: /health
```

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | HTTP port | `4000` | No |
| `CACHE_LIMIT` | Max items | `100000` | No |
| `MIX_ENV` | Environment | `dev` | No |

### Resource Requirements

**Minimum:**
- CPU: 0.5 cores
- Memory: 256MB
- Disk: 100MB

**Recommended Production:**
- CPU: 1-2 cores
- Memory: 512MB-1GB
- Disk: 500MB

**High Traffic:**
- CPU: 2-4 cores
- Memory: 1-2GB
- Disk: 1GB

## Monitoring

### Health Checks

The `/health` endpoint returns:

```json
{
  "status": "healthy"
}
```

Configure monitoring:

```bash
# Simple uptime check
while true; do
  curl -f http://localhost:4000/health || echo "Health check failed"
  sleep 30
done
```

### Metrics (Coming Soon)

Future `/metrics` endpoint will provide:
- Request rates
- Cache hit/miss ratios
- Memory usage
- Response times

### Logging

Logs are written to stdout. Configure log aggregation:

**Docker:**
```bash
docker logs -f lix-cache
```

**Kubernetes:**
```bash
kubectl logs -f deployment/lix-cache
```

**Log aggregation services:**
- Datadog
- New Relic
- CloudWatch
- ELK Stack
- Grafana Loki

## Scaling

### Horizontal Scaling

⚠️ **Important**: Each instance has its own cache. Requests to different instances may see different data.

**Solutions:**

1. **Sticky Sessions**: Configure load balancer for session affinity
2. **Cache Warming**: Populate cache on instance startup
3. **Shared Backend** (Future): Use Redis/Memcached for shared state

**Load balancer configuration example** (nginx):

```nginx
upstream lix-cache-cluster {
  ip_hash;  # Sticky sessions based on client IP
  server lix-cache-1:4000;
  server lix-cache-2:4000;
  server lix-cache-3:4000;
}
```

### Vertical Scaling

Increase resources per instance:

```yaml
deploy:
  resources:
    limits:
      cpus: '4.0'
      memory: 2G
```

Update `CACHE_LIMIT` accordingly:

```bash
CACHE_LIMIT=1000000  # 1 million items
```

## Security

### Current State

Lix Cache is designed for **internal use within trusted networks**. There is currently no built-in authentication.

### Production Security Recommendations

1. **Deploy behind reverse proxy** (nginx, Traefik, Cloudflare)
2. **Enable TLS** at proxy level
3. **Use private networks** (VPC, private subnets)
4. **Configure firewall rules** (allow only from app servers)
5. **Use API gateway** for external access (AWS API Gateway, Kong)

### Example: nginx with basic auth

```nginx
server {
  listen 443 ssl;
  server_name cache.example.com;

  ssl_certificate /etc/nginx/ssl/cert.pem;
  ssl_certificate_key /etc/nginx/ssl/key.pem;

  auth_basic "Restricted";
  auth_basic_user_file /etc/nginx/.htpasswd;

  location / {
    proxy_pass http://lix-cache:4000;
  }
}
```

Generate password file:

```bash
htpasswd -c /etc/nginx/.htpasswd admin
```

### Future Security Features

Planned for future releases:
- API key authentication
- Rate limiting
- Request signing
- mTLS support

## Backup & Recovery

### Cache is Ephemeral

Lix Cache stores data in memory only. On restart, all data is lost. This is by design for caching use cases.

### Persistent Data

If you need persistence:
- Use Lix Cache as a cache layer only
- Store authoritative data in a database
- Implement cache warming on startup

### Disaster Recovery

1. Deploy in multiple regions
2. Use health checks to route traffic
3. Implement automatic failover
4. Cache can be rebuilt from database

## Cost Estimates

### Cloud Hosting (Monthly)

| Platform | Plan | CPU | RAM | Cost |
|----------|------|-----|-----|------|
| Fly.io | Shared CPU | 1 | 512MB | ~$5 |
| Railway | Starter | 1 | 512MB | ~$5 |
| Render | Starter | 0.5 | 512MB | $7 |
| Digital Ocean | Basic | 1 | 512MB | $5 |
| AWS Fargate | - | 0.5 | 1GB | ~$15 |

### Self-Hosted

- VPS: $5-20/mo (DigitalOcean, Linode, Vultr)
- Raspberry Pi: One-time $50-100

## Troubleshooting

### Container won't start

Check logs:
```bash
docker logs lix-cache
```

Common issues:
- Port already in use
- Insufficient memory
- Permission issues

### High memory usage

Reduce cache limit:
```bash
CACHE_LIMIT=50000
```

### Slow responses

1. Check resources (CPU/memory)
2. Review cache hit ratio (coming soon)
3. Scale horizontally
4. Increase cache size

### Connection refused

1. Check container is running: `docker ps`
2. Check port mapping: `docker port lix-cache`
3. Check firewall rules
4. Check health endpoint: `curl http://localhost:4000/health`

## Support

For deployment help:
- GitHub Issues: https://github.com/your-org/lix-cache/issues
- Documentation: https://github.com/your-org/lix-cache
- Community: Coming soon

## License

MIT
