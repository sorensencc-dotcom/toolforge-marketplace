<!--
title: "Ollama Provider & Deployment Guide"
status: active
owner: chris
last-reviewed: 2026-09-27
brand: product-toolforge
-->

# Ollama Provider & Deployment Guide

## Overview

This guide covers the `OllamaProvider` implementation, environment configuration, and deployment strategies for Toolforge Marketplace with Ollama local model inference.

## Provider topology

![TorqueQuery and WhichLLM provider topology](wiki/research/whichllm-architecture-topology.png)

This topology shows the governed model-selection path that routes eligible work to the Ollama local-provider branch before deployment-specific configuration applies.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Code                         │
│  (adversarial-auditor, services, routes, etc.)             │
│                        │                                    │
│                        ↓                                    │
│         ┌──────────────────────────────┐                   │
│         │   getProvider() Factory      │                   │
│         │  (src/providers/index.ts)   │                   │
│         └──────────────────────────────┘                   │
│                        │                                    │
│                        ↓                                    │
│         ┌──────────────────────────────┐                   │
│         │    OllamaProvider            │                   │
│         │  (LocalProviderLike impl)   │                   │
│         └──────────────────────────────┘                   │
│                        │                                    │
│    Reads from env: OLLAMA_BASE_URL                          │
│    Default: http://host.docker.internal:11434/v1           │
│                        │                                    │
│                        ↓                                    │
│         ┌──────────────────────────────┐                   │
│         │   Ollama API Endpoint        │                   │
│         │   /chat/completions          │                   │
│         └──────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

## Environment Configuration

### Local Development (Docker Desktop)

1. Copy `.env.example` to `.env` (git-ignored):
   ```bash
   cp .env.example .env
   ```

2. Verify `OLLAMA_BASE_URL` in `.env`:
   ```env
   OLLAMA_BASE_URL=http://host.docker.internal:11434/v1
   ```

3. Start services:
   ```bash
   docker compose up
   ```

### Kubernetes Production

ConfigMap and Secret are defined in `k8s-manifests.yaml`:

- **ConfigMap** (`toolforge-config`): Non-secret URLs and timeouts
- **Secret** (`toolforge-secrets`): API keys and sensitive credentials

Apply manifests:
```bash
kubectl apply -f k8s-manifests.yaml
```

Endpoints auto-resolve to:
```
OLLAMA_BASE_URL=http://ollama-service.toolforge.svc.cluster.local:11434/v1
```

## Docker Compose Setup

### Services

- **ollama**: Ollama inference engine (port 11434)
- **api**: Node.js API server (port 3000)
- **ui**: React UI dev server (port 5173)

### Usage

```bash
# Start all services
docker compose up -d

# Pull and run a model
docker compose exec ollama ollama pull llama2

# Check Ollama status
docker compose exec ollama curl http://localhost:11434/api/tags

# View logs
docker compose logs -f api

# Stop services
docker compose down
```

## Kubernetes Deployment

### Prerequisites

- Kubernetes 1.20+
- 50GB persistent storage available
- Sufficient compute (2Gi memory minimum for Ollama pod)

### Deploy

```bash
# Create namespace and deploy
kubectl apply -f k8s-manifests.yaml

# Verify Ollama StatefulSet is ready
kubectl get statefulsets -n toolforge
kubectl logs -n toolforge -l app=ollama -f

# Verify API Deployment
kubectl get deployments -n toolforge
kubectl get pods -n toolforge

# Port-forward for local testing
kubectl port-forward -n toolforge svc/toolforge-api-service 8080:80
```

### Load Model

```bash
# Connect to Ollama pod
kubectl exec -it -n toolforge ollama-0 -- bash

# Pull model inside pod
ollama pull llama2

# Exit and verify
exit

# Check available models
kubectl exec -n toolforge ollama-0 -- curl http://localhost:11434/api/tags
```

## OllamaProvider API

### Initialization

```typescript
import { getProvider } from './src/providers/index.js';

// Automatic (reads from OLLAMA_BASE_URL env var)
const provider = getProvider();

// Explicit config override
const provider = getProvider({
  baseUrl: 'http://custom:11434/v1',
  timeout: 60000
});
```

### Usage

```typescript
import { getProvider } from './src/providers/index.js';

const provider = getProvider();

const result = await provider.generate('llama2', 'What is Docker?');
console.log(result);
```

### Error Handling

```typescript
try {
  const provider = getProvider();
  const result = await provider.generate('llama2', 'prompt');
} catch (error) {
  if (error.message.includes('timed out')) {
    console.error('Request timeout');
  } else if (error.message.includes('Failed to connect')) {
    console.error('Ollama unreachable');
  } else if (error.message.includes('Malformed')) {
    console.error('Invalid response from Ollama');
  } else {
    console.error('Other error:', error.message);
  }
}
```

## Testing

Run provider tests:

```bash
npm test -- src/providers/__tests__/ollama-provider.test.ts
```

Test categories:
- ✅ Successful 2xx responses with valid Ollama format
- ✅ Timeout handling
- ✅ Non-2xx HTTP status codes
- ✅ Malformed response bodies
- ✅ Connection failures (Ollama unavailable)
- ✅ Parameter validation (empty modelName, prompt)

## Integration Examples

### 1. Adversarial Auditing with Ollama

```typescript
import { getProvider } from './src/providers/index.js';
import { runAdversarialCrossAudit } from './modules/healing/adversarial-auditor.js';

const provider = getProvider();
const verdict = await runAdversarialCrossAudit(auditPacket, provider);
```

### 2. Express Route Handler

```typescript
import { getProvider } from './src/providers/index.js';
import express from 'express';

const app = express();

app.post('/api/generate', async (req, res) => {
  try {
    const { model, prompt } = req.body;
    const provider = getProvider();
    const result = await provider.generate(model, prompt);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 3. Service Layer

```typescript
import { getProvider } from './src/providers/index.js';

export async function analyzeCode(code: string): Promise<string> {
  const provider = getProvider();
  return provider.generate('neural-chat', `Analyze this code:\n${code}`);
}
```

## Troubleshooting

### Ollama Not Reachable

**Docker Compose:**
```bash
# Check container health
docker compose ps

# View Ollama logs
docker compose logs ollama

# Verify port is exposed
docker compose port ollama 11434

# Test endpoint
curl http://localhost:11434/api/tags
```

**Kubernetes:**
```bash
# Check pod status
kubectl get pods -n toolforge -l app=ollama

# View logs
kubectl logs -n toolforge ollama-0

# Test from API pod
kubectl exec -it -n toolforge -l app=toolforge-api -- \
  curl http://ollama-service.toolforge.svc.cluster.local:11434/api/tags

# Check DNS resolution
kubectl run -it --rm debug --image=alpine -- \
  sh -c "wget -O- http://ollama-service.toolforge.svc.cluster.local:11434/api/tags"
```

### Model Not Found

```bash
# Docker Compose
docker compose exec ollama ollama pull llama2

# Kubernetes
kubectl exec -n toolforge ollama-0 -- ollama pull llama2
```

### Timeout Issues

Increase `OLLAMA_TIMEOUT` in environment:

- Docker Compose: Add to `docker-compose.yml` or `.env.local`
- Kubernetes: Update `ConfigMap` in `k8s-manifests.yaml`

```env
OLLAMA_TIMEOUT=60000  # 60 seconds
```

### Memory/Resource Constraints

Ollama is memory-intensive. Ensure adequate resources:

- Docker Desktop: Set memory to ≥8GB
- Kubernetes: Pod limits set to 8Gi (configurable in `k8s-manifests.yaml`)

## Security Considerations

- **No secrets in code**: All endpoints and credentials via environment
- **Kubernetes RBAC**: ServiceAccount with minimal read-only permissions
- **Network policies**: Restrict Ollama access to API pods
- **Secret management**: Use sealed-secrets or external-secrets operator for production credentials

## Performance Tuning

### Ollama StatefulSet (Kubernetes)

Adjust in `k8s-manifests.yaml`:
```yaml
resources:
  requests:
    memory: "4Gi"      # Increase for larger models
    cpu: "2000m"
  limits:
    memory: "16Gi"
    cpu: "4000m"
```

### Storage

Default 50Gi PVC. Adjust `volumeClaimTemplates` in `k8s-manifests.yaml` based on models.

### Request Timeout

```env
OLLAMA_TIMEOUT=120000  # 2 minutes for complex operations
```

## Next Steps

1. **Deploy docker-compose for local development:**
   ```bash
   docker compose up
   ```

2. **Pull a model:**
   ```bash
   docker compose exec ollama ollama pull llama2
   ```

3. **Test provider:**
   ```bash
   npm test -- src/providers/__tests__/ollama-provider.test.ts
   ```

4. **Integrate in your application:**
   ```typescript
   import { getProvider } from './src/providers/index.js';
   const provider = getProvider();
   const result = await provider.generate('llama2', 'prompt');
   ```

5. **Deploy to Kubernetes:**
   ```bash
   kubectl apply -f k8s-manifests.yaml
   ```
