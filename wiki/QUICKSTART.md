<!--
title: "🚀 OllamaProvider — Ready to Use"
status: active
owner: chris
last-reviewed: 2026-09-27
brand: product-toolforge
-->

# 🚀 OllamaProvider — Ready to Use

## What's New

A complete, production-ready **OllamaProvider** implementation with shared configuration across local, Docker Compose, and Kubernetes environments.

- ✅ Single provider code path used everywhere
- ✅ Environment-driven endpoints (no hardcoded URLs)
- ✅ Comprehensive test suite (8 test categories)
- ✅ Docker Compose for local development
- ✅ Kubernetes manifests for production
- ✅ ConfigMap + Secret for secure credential management
- ✅ No secrets committed to VCS

## 📂 Quick File Reference

| File | Purpose | Should Commit |
|------|---------|:---:|
| `src/providers/ollama-provider.ts` | Core provider implementation | ✅ |
| `src/providers/index.ts` | DI factory (getProvider) | ✅ |
| `src/api/providers-api.ts` | Express routes | ✅ |
| `modules/healing/adversarial-auditor.ts` | Updated with provider import | ✅ |
| `.env.example` | Environment template (no secrets) | ✅ |
| `docker-compose.yml` | Local dev stack | ✅ |
| `k8s-manifests.yaml` | Production deployment | ✅ |
| `OLLAMA_PROVIDER_SETUP.md` | Quick start guide | ✅ |
| `OLLAMA_DEPLOYMENT_GUIDE.md` | Detailed deployment | ✅ |
| `IMPLEMENTATION_SUMMARY.md` | What was delivered | ✅ |
| `CHECKLIST.md` | Verification checklist | ✅ |
| `.env` | Local secrets (DO NOT commit) | ❌ |

## ⚡ Get Started in 5 Minutes

### Step 1: Copy environment template
```bash
cp .env.example .env
```

### Step 2: Start Docker Compose
```bash
docker compose up -d
```

### Step 3: Pull a model
```bash
docker compose exec ollama ollama pull llama2
```

### Step 4: Use the provider in your code
```typescript
import { getProvider } from './src/providers/index.js';

const provider = getProvider();
const response = await provider.generate('llama2', 'What is Docker?');
console.log(response);
```

### Step 5: Run tests
```bash
npm test -- src/providers/__tests__/ollama-provider.test.ts
```

## 🔑 Key Features

### 1. Environment-Driven Configuration
- Local: `http://host.docker.internal:11434/v1` (Docker Desktop)
- Compose: `http://ollama:11434/v1` (service name)
- K8s: `http://ollama-service.toolforge.svc.cluster.local:11434/v1` (DNS FQDN)

All from single `OLLAMA_BASE_URL` environment variable.

### 2. Single Shared Provider
One `OllamaProvider` implementation used everywhere:
```typescript
import { getProvider } from './src/providers/index.js';
const provider = getProvider(); // Same code, different env
```

### 3. No Hardcoded Endpoints
✅ All endpoints from environment
✅ Defaults only in local development
✅ ConfigMap/Secret for production

### 4. Complete Test Coverage
```bash
npm test -- src/providers/__tests__/ollama-provider.test.ts
```
- ✅ Success paths
- ✅ Timeouts
- ✅ HTTP errors (non-2xx)
- ✅ Malformed responses
- ✅ Connection failures
- ✅ Parameter validation

### 5. API Integration Ready
```typescript
// In your Express app
import { setupProviderRoutes } from './src/api/providers-api.js';
setupProviderRoutes(app);

// Routes added:
// POST /api/generate — generate text
// POST /api/audit — run adversarial audit
// GET /api/models — list available models
// GET /health/provider — health check
```

## 📋 Deployment Paths

### Local Development
```bash
docker compose up -d
docker compose exec ollama ollama pull llama2
npm run api:dev
```

### Docker Compose (Testing)
```bash
docker compose up
# Services auto-wire to each other
```

### Kubernetes (Production)
```bash
kubectl apply -f k8s-manifests.yaml
kubectl wait --for=condition=Ready pod -l app=ollama -n toolforge
kubectl exec -n toolforge ollama-0 -- ollama pull llama2
```

## 📚 Documentation

| File | Content |
|------|---------|
| `OLLAMA_PROVIDER_SETUP.md` | Quick start, integration patterns, troubleshooting |
| `OLLAMA_DEPLOYMENT_GUIDE.md` | Architecture, security, performance, detailed setup |
| `IMPLEMENTATION_SUMMARY.md` | What was built, file structure, next steps |
| `CHECKLIST.md` | Verification checklist, requirements met |

## 🎯 Common Tasks

### Using the Provider in Code
```typescript
import { getProvider } from './src/providers/index.js';
import { runAdversarialCrossAudit } from './modules/healing/adversarial-auditor.js';

// Direct usage
const provider = getProvider();
const text = await provider.generate('llama2', 'prompt');

// In modules (already integrated)
const verdict = await runAdversarialCrossAudit(packet, provider);
```

### Adding to Express
```typescript
import { setupProviderRoutes } from './src/api/providers-api.js';

const app = express();
setupProviderRoutes(app);

app.listen(3000);
```

### Testing
```bash
# Run provider tests
npm test -- src/providers/__tests__/ollama-provider.test.ts

# With real Ollama (after docker compose up)
npm test

# Watch mode
npm run test:watch
```

### Troubleshooting
```bash
# Check Ollama status
docker compose ps ollama
curl http://localhost:11434/api/tags

# Check logs
docker compose logs ollama

# Restart services
docker compose down
docker compose up -d
```

## 🔐 Security

- ✅ No secrets in code
- ✅ `.env.example` committed (no real values)
- ✅ `.env` in `.gitignore` (local secrets only)
- ✅ Kubernetes Secret for credentials
- ✅ RBAC: ServiceAccount with minimal permissions
- ✅ Non-root containers
- ✅ Read-only filesystems where possible

## 📊 What's Included

### Provider Code (src/providers/)
- `ollama-provider.ts` — OllamaProvider class (3.4 KB)
- `index.ts` — DI factory (841 B)
- `usage-examples.ts` — Integration patterns (2.6 KB)
- `__tests__/ollama-provider.test.ts` — Tests (6.9 KB)

### Integration (src/api/)
- `providers-api.ts` — Express routes & middleware (5.6 KB)

### Deployment Config
- `docker-compose.yml` — Local dev stack (1.5 KB)
- `k8s-manifests.yaml` — Production deployment (8.6 KB)
- `.env.example` — Environment template (1.1 KB)

### Documentation
- `OLLAMA_PROVIDER_SETUP.md` (6.8 KB)
- `OLLAMA_DEPLOYMENT_GUIDE.md` (9.8 KB)
- `IMPLEMENTATION_SUMMARY.md` (8.2 KB)
- `CHECKLIST.md` (7.2 KB)

**Total: ~60 KB of production-ready code + docs**

## ✅ Ready to Use

All components are:
- ✅ Implemented and tested
- ✅ Documented with examples
- ✅ Production-ready for Kubernetes
- ✅ Development-ready for local testing
- ✅ Integrated with existing modules

## 🚀 Next Step

Start with **5-minute quickstart** above, then read **`OLLAMA_PROVIDER_SETUP.md`** for detailed integration patterns.

Need production deployment? Check **`OLLAMA_DEPLOYMENT_GUIDE.md`** and **`k8s-manifests.yaml`**.

**Everything is ready. Start using it now!**
