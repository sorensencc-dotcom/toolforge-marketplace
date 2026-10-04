<!--
title: "OllamaProvider Setup & Quick Start"
status: active
owner: chris
last-reviewed: 2026-09-27
brand: product-toolforge
-->

# OllamaProvider Setup & Quick Start

## Provider topology

![TorqueQuery and WhichLLM provider topology](wiki/research/whichllm-architecture-topology.png)

This topology shows the governed router, model-selection adapter, and local provider branch that includes Ollama.

## What Was Created

### 1. Provider Implementation
- **`src/providers/ollama-provider.ts`** — `OllamaProvider` class implementing `LocalProviderLike`
  - Reads endpoint from `OLLAMA_BASE_URL` env var
  - Defaults to `http://host.docker.internal:11434/v1` for local Docker development
  - Handles timeouts, errors, and validates responses
  
- **`src/providers/index.ts`** — Dependency injection factory
  - `getProvider()` singleton factory
  - `resetProvider()` for testing
  - Single shared instance across your app

- **`src/providers/usage-examples.ts`** — Integration patterns

### 2. Tests
- **`src/providers/__tests__/ollama-provider.test.ts`** — Comprehensive test suite
  - ✅ Success paths with valid Ollama responses
  - ✅ Timeout handling
  - ✅ Non-2xx HTTP errors
  - ✅ Malformed response handling
  - ✅ Connection failures
  - ✅ Parameter validation

### 3. Configuration
- **`.env.example`** — Environment template (commit this, not `.env`)
  ```env
  OLLAMA_BASE_URL=http://host.docker.internal:11434/v1
  ```

### 4. Deployment
- **`docker-compose.yml`** — Local/integration testing
  - Ollama service (port 11434)
  - API server (port 3000)
  - React UI (port 5173)
  - Environment wiring

- **`k8s-manifests.yaml`** — Production Kubernetes deployment
  - Ollama StatefulSet (50Gi persistent storage)
  - Toolforge API Deployment (2 replicas, HPA)
  - ConfigMap for non-secrets
  - Secret for credentials
  - RBAC (ServiceAccount, Role, RoleBinding)

### 5. Documentation
- **`OLLAMA_DEPLOYMENT_GUIDE.md`** — Complete deployment guide

## Quick Start

### Local Development (Docker Compose)

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Start services
docker compose up -d

# 3. Pull a model
docker compose exec ollama ollama pull llama2

# 4. Test provider in your code
npm test -- src/providers/__tests__/ollama-provider.test.ts
```

### Kubernetes Production

```bash
# 1. Deploy all manifests
kubectl apply -f k8s-manifests.yaml

# 2. Wait for Ollama StatefulSet to be ready
kubectl wait --for=condition=Ready pod -l app=ollama -n toolforge --timeout=300s

# 3. Pull a model
kubectl exec -n toolforge ollama-0 -- ollama pull llama2

# 4. Verify API pods are running
kubectl get pods -n toolforge -l app=toolforge-api
```

## Integration in Your Code

### Using the Provider

```typescript
// In any module that needs it:
import { getProvider } from './src/providers/index.js';

const provider = getProvider();
const response = await provider.generate('llama2', 'What is Docker?');
console.log(response);
```

### In Adversarial Auditor

```typescript
// Already integrated in modules/healing/adversarial-auditor.ts
// Imports LocalProviderLike from src/providers/index.ts

import { runAdversarialCrossAudit } from './modules/healing/adversarial-auditor.js';
import { getProvider } from './src/providers/index.js';

const provider = getProvider();
const verdict = await runAdversarialCrossAudit(packet, provider);
```

### In Express Routes

```typescript
import express from 'express';
import { getProvider } from './src/providers/index.js';

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

## Environment Variables

| Variable | Default | Context |
|----------|---------|---------|
| `OLLAMA_BASE_URL` | `http://host.docker.internal:11434/v1` | Local Docker |
| `OLLAMA_BASE_URL` | `http://ollama-service.toolforge.svc.cluster.local:11434/v1` | Kubernetes |
| `OLLAMA_TIMEOUT` | `30000` | Request timeout (ms) |

**Set in:**
- **Local Dev**: `.env` (git-ignored) or environment
- **Docker Compose**: `docker-compose.yml` environment section
- **Kubernetes**: `ConfigMap` in `k8s-manifests.yaml`

## File Layout

```
.
├── src/providers/
│   ├── ollama-provider.ts          # OllamaProvider implementation
│   ├── index.ts                     # DI factory (getProvider)
│   ├── usage-examples.ts            # Integration patterns
│   └── __tests__/
│       └── ollama-provider.test.ts  # Comprehensive tests
│
├── modules/healing/
│   └── adversarial-auditor.ts       # Updated to use provider
│
├── .env.example                     # Environment template (commit this)
├── docker-compose.yml               # Local development stack
├── k8s-manifests.yaml               # Production Kubernetes manifests
└── OLLAMA_DEPLOYMENT_GUIDE.md       # Detailed deployment guide
```

## Testing

```bash
# Run provider tests
npm test -- src/providers/__tests__/ollama-provider.test.ts

# Test with real Ollama (after docker compose up)
npm test -- src/providers/__tests__/ollama-provider.test.ts --reporter=verbose

# Run all tests
npm test
```

## Troubleshooting

### Docker Compose

```bash
# Check Ollama is healthy
docker compose ps

# View logs
docker compose logs ollama

# Test endpoint
curl http://localhost:11434/api/tags

# Pull a model
docker compose exec ollama ollama pull llama2:latest
```

### Kubernetes

```bash
# Check pod status
kubectl get pods -n toolforge

# View Ollama logs
kubectl logs -n toolforge ollama-0

# Test from API pod
kubectl exec -n toolforge -it $(kubectl get pod -n toolforge -l app=toolforge-api -o jsonpath='{.items[0].metadata.name}') -- \
  curl http://ollama-service.toolforge.svc.cluster.local:11434/api/tags

# Check ConfigMap
kubectl get configmap -n toolforge toolforge-config -o yaml
```

### Connection Refused

If you see `Failed to connect to Ollama`:

1. **Docker Compose**: Ensure Ollama container is running:
   ```bash
   docker compose ps ollama
   docker compose logs ollama
   ```

2. **Kubernetes**: Ensure StatefulSet is ready:
   ```bash
   kubectl get statefulset -n toolforge ollama
   kubectl logs -n toolforge ollama-0
   ```

3. **Check the endpoint**:
   - Local: `http://host.docker.internal:11434/v1`
   - Docker Compose: `http://ollama:11434/v1` (service name)
   - Kubernetes: `http://ollama-service.toolforge.svc.cluster.local:11434/v1`

### Timeout Issues

Increase `OLLAMA_TIMEOUT`:
```env
OLLAMA_TIMEOUT=60000  # 60 seconds instead of 30
```

## Next Steps

1. ✅ **Code**: OllamaProvider created and integrated
2. ✅ **Tests**: Full test suite with all error paths
3. ✅ **Local**: Docker Compose ready for development
4. ✅ **Production**: Kubernetes manifests for cluster deployment
5. **Your app**: Import `getProvider()` wherever you need model inference

See `OLLAMA_DEPLOYMENT_GUIDE.md` for detailed deployment instructions and architecture diagrams.
