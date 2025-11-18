# Deployment Guide

This document explains how Pharaos Runner automatically deploys to your server using GitHub Actions.

## Overview

The game uses **GitHub Actions** with a **self-hosted runner** to automatically deploy to `play.egygeeks.com` whenever code is pushed to the `main` branch.

## Architecture

```
GitHub Push → GitHub Actions → Self-Hosted Runner → Docker Build → Deploy Container
```

## Prerequisites

### 1. Self-Hosted GitHub Runner

You need a GitHub Actions self-hosted runner configured on your server:

**Setup on your server:**
```bash
# Navigate to your repository settings
# Go to: Settings → Actions → Runners → New self-hosted runner

# Follow GitHub's instructions to download and configure the runner
# The runner should be running as a service on your server
```

**Verify runner is active:**
- Go to: https://github.com/EgyGeeks/pharaos-runner/settings/actions/runners
- Status should show "Idle" or "Active"

### 2. Traefik Reverse Proxy

Your server should have Traefik configured with:
- Network named `traefik_public`
- Let's Encrypt SSL certificate resolver named `letsencrypt`

**Check Traefik is running:**
```bash
docker ps | grep traefik
docker network ls | grep traefik_public
```

### 3. Docker

Docker must be installed and the runner user must have permissions:

```bash
# Add runner user to docker group
sudo usermod -aG docker <runner-user>

# Test docker access
docker ps
```

## Deployment Workflow

The deployment is defined in `.github/workflows/deploy.yml`:

### Trigger Events
- **Push to main branch**: Automatic deployment
- **Manual trigger**: Via GitHub Actions UI (workflow_dispatch)

### Deployment Steps

1. **Checkout code**: Downloads latest code from repository
2. **Build Docker image**: Creates production Docker image with tag `pharaos-runner:latest`
3. **Tag with commit SHA**: Also tags image as `pharaos-runner:<commit-sha>` for rollback
4. **Stop old container**: Gracefully stops and removes existing container
5. **Start new container**: Deploys new container with:
   - Container name: `pharaos-runner`
   - Network: `traefik_public`
   - Domain: `play.egygeeks.com`
   - SSL: Automatic via Let's Encrypt
   - Resources: 512MB RAM, 0.5 CPU
   - Restart policy: `unless-stopped`

6. **Cleanup**: Removes old/unused Docker images
7. **Summary**: Shows deployment status and container info

## Container Configuration

```yaml
Container: pharaos-runner
Port: 3000 (internal)
Memory: 512MB
CPU: 0.5 cores
Restart: unless-stopped
Network: traefik_public
```

## Traefik Labels

The container is configured with these Traefik labels:

```bash
traefik.enable=true
traefik.http.routers.pharaos-runner.rule=Host(`play.egygeeks.com`)
traefik.http.routers.pharaos-runner.entrypoints=websecure
traefik.http.routers.pharaos-runner.tls.certresolver=letsencrypt
traefik.http.services.pharaos-runner.loadbalancer.server.port=3000
```

## How to Deploy

### Automatic Deployment

Simply push to main branch:

```bash
git add .
git commit -m "Your changes"
git push origin main
```

GitHub Actions will automatically:
1. Detect the push
2. Trigger the deployment workflow
3. Build and deploy to your server

### Manual Deployment

Via GitHub Actions UI:

1. Go to: https://github.com/EgyGeeks/pharaos-runner/actions
2. Click "Deploy Pharaos Runner" workflow
3. Click "Run workflow" button
4. Select branch (usually `main`)
5. Click "Run workflow"

## Monitoring Deployment

### Watch deployment in real-time:

**Via GitHub UI:**
- https://github.com/EgyGeeks/pharaos-runner/actions

**Via GitHub CLI:**
```bash
# List recent runs
gh run list

# Watch specific run
gh run watch <run-id>

# View run logs
gh run view <run-id> --log
```

### Check container status on server:

```bash
# Check if container is running
docker ps --filter "name=pharaos-runner"

# View container logs
docker logs pharaos-runner

# Follow logs in real-time
docker logs -f pharaos-runner

# Check container resource usage
docker stats pharaos-runner
```

### Verify deployment:

```bash
# Test HTTP response
curl -I https://play.egygeeks.com

# Should return: HTTP/2 200
```

## Rollback

If deployment fails or has issues, rollback to previous version:

```bash
# Find previous image (on your server)
docker images | grep pharaos-runner

# Stop current container
docker stop pharaos-runner
docker rm pharaos-runner

# Start previous version (replace <previous-sha> with actual commit SHA)
docker run -d \
  --name pharaos-runner \
  --restart unless-stopped \
  --network traefik_public \
  -l "traefik.enable=true" \
  -l "traefik.http.routers.pharaos-runner.rule=Host(\`play.egygeeks.com\`)" \
  -l "traefik.http.routers.pharaos-runner.entrypoints=websecure" \
  -l "traefik.http.routers.pharaos-runner.tls.certresolver=letsencrypt" \
  -l "traefik.http.services.pharaos-runner.loadbalancer.server.port=3000" \
  --memory="512m" \
  --cpus="0.5" \
  pharaos-runner:<previous-sha>
```

## Troubleshooting

### Deployment fails with "runner offline"

**Problem:** Self-hosted runner is not running

**Solution:**
```bash
# SSH to your server
ssh your-server

# Check runner status
sudo systemctl status actions.runner.EgyGeeks-pharaos-runner.*

# Restart runner
sudo systemctl restart actions.runner.EgyGeeks-pharaos-runner.*
```

### Build fails with "permission denied"

**Problem:** Runner doesn't have Docker permissions

**Solution:**
```bash
# Add runner user to docker group
sudo usermod -aG docker <runner-user>

# Restart runner service
sudo systemctl restart actions.runner.EgyGeeks-pharaos-runner.*
```

### Container won't start

**Problem:** Port conflict or network issue

**Check:**
```bash
# Check if port 3000 is in use
lsof -i :3000

# Check if traefik network exists
docker network ls | grep traefik_public

# Check container logs
docker logs pharaos-runner
```

### SSL certificate issues

**Problem:** Let's Encrypt can't verify domain

**Check:**
```bash
# Verify DNS points to your server
dig play.egygeeks.com

# Check Traefik logs
docker logs traefik

# Verify Traefik configuration
docker exec traefik cat /etc/traefik/traefik.yml
```

### Website returns 502 Bad Gateway

**Problem:** Container is running but app isn't responding

**Solution:**
```bash
# Check container logs
docker logs pharaos-runner

# Check if app is listening on port 3000
docker exec pharaos-runner netstat -tulpn | grep 3000

# Restart container
docker restart pharaos-runner
```

## Environment Variables

The following environment variables are set in the container:

```bash
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
```

To add more environment variables, edit the Dockerfile or add them to the workflow:

```yaml
docker run -d \
  --name pharaos-runner \
  -e "CUSTOM_VAR=value" \
  ...
```

## Security Notes

- The self-hosted runner has access to your repository secrets
- Runner executes on your server with specific user permissions
- Docker commands run as the runner user (should NOT be root)
- Container runs as non-root user (`nextjs` with UID 1001)
- SSL/TLS handled automatically by Traefik + Let's Encrypt

## Directory Structure

```
pharaos-runner/
├── .github/
│   └── workflows/
│       └── deploy.yml          # Deployment workflow
├── app/                        # Next.js app directory
├── Dockerfile                  # Docker build configuration
├── .dockerignore              # Files to exclude from Docker
├── package.json               # Dependencies
└── DEPLOYMENT.md              # This file
```

## Need Help?

- **GitHub Actions logs**: https://github.com/EgyGeeks/pharaos-runner/actions
- **Docker docs**: https://docs.docker.com
- **Traefik docs**: https://doc.traefik.io/traefik/
- **Next.js deployment**: https://nextjs.org/docs/deployment

---

**Game URL**: https://play.egygeeks.com
**Repository**: https://github.com/EgyGeeks/pharaos-runner
