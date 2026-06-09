# Phase 7 (cont.) — Production Deployment & Operations

## 1. Topology

```
Internet
  │  TLS (Let's Encrypt / managed cert)
  ▼
Reverse proxy (nginx / Traefik) ── HSTS, gzip, security headers, rate limit
  ├── /api/*   → NestJS API (N stateless replicas)
  ├── /        → Next.js Admin (SSR, standalone build)
  └── (mobile clients hit /api/* directly)

NestJS API ─┬─ PostgreSQL (primary + standby, PITR)
            ├─ Redis (locks, cache, refresh-token family, BullMQ)
            ├─ Worker process (BullMQ: reports, audit partition cron)
            └─ Object storage (S3 / MinIO): photos, report exports
```

All services containerized. The API and worker share one image (`node dist/main.js`
vs `node dist/worker.js`).

## 2. Environments & Config
- `dev` (docker-compose), `staging`, `prod`. Config via env vars only (12-factor).
- Secrets (`JWT_*`, `DATA_ENCRYPTION_KEY`, DB creds, S3 keys) come from a secret
  manager (AWS Secrets Manager / GCP Secret Manager / Vault) — **never** committed.
- `DATA_ENCRYPTION_KEY`: 32-byte key, base64. Rotate via envelope re-encryption job.

## 3. Build & Release (CI/CD)
1. **CI** (`.github/workflows/ci.yml`): lint → typecheck → unit/integration tests
   (Postgres+Redis services) → `prisma migrate deploy` against test DB → build
   images for backend/admin → `flutter analyze` + `flutter test`.
2. **CD**: on tag/main → push images to registry → run DB migrations as a
   one-shot job → rolling deploy API + admin → smoke test `/api/v1/health`.
3. Mobile: build signed AAB/IPA in a separate pipeline; distribute via Play
   Console / TestFlight.

## 4. Database Operations
- **Migrations**: `prisma migrate deploy` (forward-only in prod). Apply
  `prisma/migrations/_custom/partial_indexes.sql` once after baseline (partial
  unique indexes + pg_trgm). Use expand→migrate→contract for destructive changes.
- **Backups**: nightly base backup + WAL archiving → **PITR**. Test restores
  monthly. Retain per legal policy.
- **Audit partitions**: monthly `audit_logs` partition pre-created by a scheduled
  job; app DB role has INSERT+SELECT only (no UPDATE/DELETE) to keep it append-only.
- **Connection pooling**: PgBouncer (transaction mode) in front of Postgres.

## 5. Scaling & Availability
- API is stateless → scale horizontally behind the proxy. Redis holds locks and
  refresh-token families so any replica can serve any request.
- Attendance ingest is idempotent (eventId), so retries/replays across replicas
  are safe. The single-open-session partial unique index is the DB-level guard.
- Postgres primary + standby with automated failover (Patroni / managed RDS).

## 6. Security Hardening Checklist
- [x] TLS everywhere; HSTS; secure + httpOnly + sameSite cookies (admin).
- [x] JWT access (15m) + rotating refresh (30d) with **reuse detection**.
- [x] Argon2id password & token hashing.
- [x] RBAC enforced server-side on every route; org/site scoping.
- [x] Device registration + authorization; attendance requires authorized device.
- [x] AES-256-GCM field encryption for Aadhaar; reveal gated + audited.
- [x] Rate limiting (global throttler + per-device on attendance).
- [x] Input validation (whitelist + forbidNonWhitelisted); problem+json errors.
- [x] Append-only audit on every mutation (old/new values).
- [ ] Pre-prod: dependency audit (`npm audit`), container image scan, secret scan.
- [ ] Pre-prod: pen-test of auth, RBAC bypass, IDOR on org/site scope.
- [ ] CSP + security headers at the proxy; disable Swagger UI in prod (or auth-gate).

## 7. Observability
- **Logs**: structured JSON; include `requestId` (set by RequestIdMiddleware) for
  tracing a request across API → DB.
- **Metrics**: request rate/latency/error, sync batch sizes, outbox lag, queue
  depth (BullMQ), DB connections. Export to Prometheus; dashboards in Grafana.
- **Alerts**: API 5xx rate, DB replication lag, Redis memory, report job failures,
  rising correction/conflict counts, clock-skew-flagged taps.
- **Health**: `/api/v1/health` (DB ping) for load-balancer checks.

## 8. Runbooks (summary)
- **Sync backlog growing**: check API/Redis health; backlog is safe (durable on
  devices); investigate network/auth; devices auto-retry with backoff.
- **Duplicate attendance reported**: verify eventId uniqueness; check for client
  not reusing eventId on retry (should never happen — it's generated once).
- **Clock tampering flags**: compare `client_event_time` vs `server_received_at`
  vs `monotonic_ms`; hours use server-anchored time; review flagged taps.
- **Lost device**: revoke device (`PATCH /devices/{id}` → REVOKED); its token is
  cleared; queued events from before revocation are still accepted per policy.
- **Key rotation**: deploy new `DATA_ENCRYPTION_KEY` as v2; run re-encryption job;
  retire v1 after completion.

## 9. Disaster Recovery
- RPO: ≤ 5 min (WAL archiving). RTO: ≤ 1 h (standby promotion + app redeploy).
- Object storage versioned + cross-region replication for photos/exports.
- Device outboxes are an additional safety net: unsynced attendance survives a
  full backend restore gap and re-syncs idempotently.

## 10. Go-Live Checklist
- [ ] Secrets provisioned in secret manager; no secrets in env files.
- [ ] Migrations applied incl. custom partial indexes; seed super-admin rotated.
- [ ] TLS + headers verified; Swagger gated/disabled.
- [ ] Backups + PITR validated by a test restore.
- [ ] Monitoring dashboards + alerts live.
- [ ] Load test attendance ingest at expected peak (taps/sec across sites).
- [ ] Field test on target Android hardware: NFC NTAG213/215/216, QR, offline→online.
- [ ] Runbooks reviewed with ops.
