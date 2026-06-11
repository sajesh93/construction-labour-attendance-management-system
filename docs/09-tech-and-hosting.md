# CLAMS — Technical Overview & Hosting

_Construction Labour Attendance Management System_

This document explains the **technology stack**, **architecture**, and **where the
system is actually deployed** (live Azure environment, captured 2026-06-10). It
complements the design docs in `docs/01-architecture.md` and
`docs/08-deployment.md` — note that those describe the *intended* topology, while
the **Hosting** section below reflects what is *currently provisioned* in Azure.

---

## 1. What it is

An offline-first attendance platform for construction labour across multiple
sites. Workers carry NFC ID cards (NTAG213/215/216) or QR badges that hold only a
Worker ID / UID — **all PII lives in the backend**. A Flutter Android app reads
the tag, records the tap locally, and syncs idempotently to a NestJS API. A
Next.js admin panel manages master data, corrections, reports, and audit.

Core guarantees: no attendance loss (durable device outbox + idempotent ingest),
full auditability, corrections never mutate attendance until approved, sensitive
fields (Aadhaar) encrypted at rest, server-authoritative UTC time.

---

## 2. Monorepo layout

| Path | Component | Stack |
|---|---|---|
| `/backend` | REST API + (intended) worker | NestJS 10, Prisma 5, PostgreSQL, Redis |
| `/admin` | Admin web panel | Next.js 14 (App Router), TypeScript, MUI 6 |
| `/mobile` | Field app (Android now, iOS later) | Flutter (Material 3), Riverpod, Drift/SQLite |
| `/infra` | Local dev orchestration | docker-compose, Dockerfiles |
| `/docs` | Architecture & design docs | Markdown |
| `/.github/workflows` | CI + mobile APK build | GitHub Actions |

---

## 3. Tech stack by layer

### Backend (`/backend`)
- **NestJS 10** modular monolith, **DDD-lite**. URI versioning — all routes under `/api/v1`.
- **Prisma 5** ORM against **PostgreSQL 16**.
- **Redis** (ioredis) for distributed locks, caching, rate-limit state, refresh-token families, and **BullMQ** queues.
- **Auth**: JWT access (15 min) + rotating refresh (30 d) with reuse detection; `passport-jwt`. **Argon2id** for password/token hashing.
- **RBAC**: roles `SUPER_ADMIN` / `SITE_ADMIN` / `WATCHMAN` / `SUPERVISOR`, evaluated per request via a `PolicyGuard` with org/site scoping.
- **Device binding**: attendance endpoints require an `AUTHORIZED` device (`X-Device-Id`).
- **Field encryption**: AES-256-GCM for Aadhaar (`DATA_ENCRYPTION_KEY`, 32-byte base64).
- **Audit**: append-only log of `actor · action · old · new · timestamp · requestId` on every mutation.
- **Validation**: global `ValidationPipe` (`whitelist` + `forbidNonWhitelisted`); problem+json error filter; `RequestIdMiddleware` for tracing.
- **API docs**: OpenAPI/Swagger UI at `/api/docs`.
- **Health**: `GET /api/v1/health` (DB ping) — used for ingress probes.
- Runs as `node dist/main.js`. A separate worker entrypoint (`node dist/worker.js`) exists in code for BullMQ jobs but is **not currently deployed as its own service** (see §6).

### Admin panel (`/admin`)
- **Next.js 14 App Router**, server components + client islands; SSR for fast first paint.
- **MUI 6** + `@mui/x-data-grid`, **Emotion** styling, **TanStack React Query** for data fetching, **react-hook-form** + **zod** for forms/validation.
- **QR badge generation** via `qrcode.react`.
- Server-side session handling: login route sets a secure httpOnly cookie; a server-side proxy (`app/api/proxy/[...path]`) forwards to the API so the browser never holds the JWT directly.
- Talks to the API via two URLs: `NEXT_PUBLIC_API_BASE_URL` (browser) and `API_INTERNAL_BASE_URL` (server-to-server).

### Mobile app (`/mobile`)
- **Flutter** (Material 3), **Clean Architecture**, **Riverpod** DI/state.
- **Drift (SQLite)** durable local outbox — offline-first; events survive restarts and re-sync idempotently.
- **NFC** tag read (NTAG213/215/216) with **QR scanner** fallback (`mobile_scanner`, bundled ML Kit — no Play Services dependency).
- **Geolocation** capture, **flutter_secure_storage** for tokens (Android Keystore).
- API base URL baked at build time via `--dart-define=API_BASE_URL=...` (`lib/core/config/env.dart`).

---

## 4. Request / data flow

```
Worker taps NFC/QR
        │
        ▼
Flutter app  ──(records tap in local Drift outbox)──►  durable, offline-safe
        │
        │  batch sync (each event has a client-generated eventId / Idempotency-Key)
        ▼
NestJS API  /api/v1/*   (device-authorized, JWT)
        │
        ├─ PostgreSQL 16   ← system of record (workers, sessions, audit)
        └─ Redis           ← locks, cache, rate limit, refresh tokens, BullMQ

Admin (browser) ──► Next.js SSR + server proxy ──► same NestJS API
```

- **Attendance domain**: a tap resolves a worker, then opens or closes a *session*
  (login→logout). A work-hours engine derives daily/monthly totals, overtime,
  late/early from sessions + per-site shift config.
- **Idempotency** on `eventId` is the backbone of "no loss + no duplicates"; a
  DB-level partial unique index enforces single-open-session.
- **Corrections** follow a request → review → approve/reject state machine;
  attendance is not mutated until approval.

---

## 5. Hosting — where it actually runs (Azure)

**Live as of 2026-06-10.** All resources sit in one resource group.

| Property | Value |
|---|---|
| Cloud | Microsoft Azure (`AzureCloud`) |
| Subscription | `Azure subscription 1` (`b07e8ca7-…-59ffc0cc7b35`) |
| Tenant | `karans9954outlook.onmicrosoft.com` |
| Resource group | **`clams-rg`** |
| Region | **Central India** (`centralindia`) |
| Platform | **Azure Container Apps** (serverless containers) |

### Resources in `clams-rg`

| Resource | Type | Role |
|---|---|---|
| `clams-env` | Container Apps managed environment | Hosts all container apps; provides ingress + managed TLS + Log Analytics |
| `clams-api` | Container App | NestJS API (**external** ingress) |
| `clams-admin` | Container App | Next.js admin panel (**external** ingress) |
| `clams-redis` | Container App | Redis 7 (**internal** ingress only) |
| `clams-pg-8ca7` | PostgreSQL Flexible Server | Primary database |
| `clamsacr8ca7` | Azure Container Registry | Stores `clams-api` / `clams-admin` images |
| `workspace-clamsrglZYq` | Log Analytics workspace | Container logs / observability |

### Public endpoints

| Service | URL |
|---|---|
| API | `https://clams-api.lemoncoast-b230ecb6.centralindia.azurecontainerapps.io` (base path `/api/v1`) |
| Admin | `https://clams-admin.lemoncoast-b230ecb6.centralindia.azurecontainerapps.io` |
| Redis | `clams-redis.internal.lemoncoast-b230ecb6.centralindia.azurecontainerapps.io` (cluster-internal, not public) |

The **mobile APK** is built in GitHub Actions with the API URL baked in (default =
the `clams-api` FQDN above; see `.github/workflows/mobile-apk.yml`).

### Container App sizing

| App | Image | CPU | Memory | Replicas | Ingress |
|---|---|---|---|---|---|
| `clams-api` | `clamsacr8ca7.azurecr.io/clams-api@sha256:fb21e409…` | 0.5 | 1 Gi | 1 → 1 | external |
| `clams-admin` | `clamsacr8ca7.azurecr.io/clams-admin@sha256:370fc83c…` | 0.5 | 1 Gi | 1 → 1 | external |
| `clams-redis` | `redis:7-alpine` | 0.25 | 0.5 Gi | 1 → 1 | internal |

> Replicas are pinned at min=max=1, so there is **no horizontal autoscale** today
> and **Redis is a single non-persistent container** (not Azure Cache for Redis) —
> see Gaps below.

### PostgreSQL Flexible Server (`clams-pg-8ca7`)

| Property | Value |
|---|---|
| Engine | PostgreSQL **16** |
| SKU / tier | `Standard_B1ms` (**Burstable**, 1 vCore) |
| Storage | 32 GB |
| Backup retention | 7 days |
| High availability | **Not enabled** |
| FQDN | `clams-pg-8ca7.postgres.database.azure.com` |

### Container Registry

`clamsacr8ca7.azurecr.io` — **Basic** SKU. CI/CD builds the API and admin images
and pushes them here; Container Apps pull by image digest.

### API runtime configuration (env vars on `clams-api`)

`DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
`DATA_ENCRYPTION_KEY`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `API_PORT`,
`NODE_ENV`, `CORS_ORIGINS`.

---

## 6. Build, CI/CD & deployment

- **CI** (`.github/workflows/ci.yml`): on push to `main`/`develop` and PRs —
  - *backend*: spins up Postgres + Redis service containers → `prisma generate` → `prisma migrate deploy` → lint → `test:cov` → build.
  - *admin*: `npm ci` → lint → vitest → `next build`.
  - *mobile*: `flutter analyze` + `flutter test`.
- **Mobile APK** (`.github/workflows/mobile-apk.yml`): manual or on `mobile/**`
  changes → `flutter build apk --release` with the API URL baked in → uploads
  `app-release.apk` artifact. Release builds disable R8 minification (fixes a
  `mobile_scanner` runtime null-ref).
- **Image build/deploy**: container images are built and pushed to `clamsacr8ca7`,
  then deployed to the `clams-*` Container Apps (deployed by digest). DB
  migrations are run as a **separate deploy step**, not per-replica on startup
  (the Dockerfile `CMD` only runs `node dist/main.js` to avoid advisory-lock
  contention).
- **Local dev** (`infra/docker-compose.yml`): brings up Postgres 16, Redis 7, and
  **MinIO** (S3-compatible object storage) + the api/admin images.

---

## 7. Gaps: design docs vs. live deployment

The architecture docs describe a more elaborate target topology. What is **not**
provisioned in the current Azure environment:

- **No object storage** (no Azure Blob / Storage Account). Docs reference S3/MinIO
  for worker photos and report exports; only local dev uses MinIO. Any
  photo/report-export feature relying on object storage is not backed by cloud
  storage in prod yet.
- **No dedicated worker container app**. The BullMQ worker (`dist/worker.js`)
  exists in code but is not deployed as its own Container App, so background
  jobs (report generation, audit-partition cron) would currently run only if
  hosted elsewhere or not at all.
- **No reverse proxy** (nginx/Traefik). Azure Container Apps provides ingress,
  managed TLS, and HTTPS termination natively, so the separate proxy layer from
  the docs is unnecessary here. Security headers/CSP/rate-limit-at-proxy from the
  hardening checklist would need to be handled in-app or via Container Apps config.
- **Single-instance, no HA**: API/admin/Redis are pinned to 1 replica; Postgres
  has HA disabled. The stateless-horizontal-scaling and primary+standby story in
  the docs is supported by the code but not enabled in this environment.
- **Redis is ephemeral**: a `redis:7-alpine` container, not a managed/persistent
  cache. Refresh-token families and locks live there, so a Redis restart drops
  that state.

These are deployment/scaling choices (cost-minimal single-tenant setup), not code
limitations — the application is built to support the fuller topology when scaled
up.

---

## 8. Quick reference — Azure CLI

```bash
# Everything in the resource group
az resource list -g clams-rg -o table

# Container app status, image, replicas
az containerapp list -g clams-rg \
  --query "[].{name:name,fqdn:properties.configuration.ingress.fqdn,replicas:properties.template.scale.minReplicas}" -o table

# Tail API logs
az containerapp logs show -g clams-rg -n clams-api --follow

# Database
az postgres flexible-server show -g clams-rg -n clams-pg-8ca7 -o jsonc
```
