# Phase 7 — Implementation Plan

Sequenced milestones with deliverables, exit criteria, and tests. Coding begins
**only after approval** (Phase 8). Suggested order builds backend → admin →
mobile, with infra and CI established up front.

## Repository Layout (monorepo)
```
/backend     NestJS API + workers
/admin       Next.js admin panel
/mobile      Flutter app
/infra        docker-compose, Dockerfiles, deploy docs, .env templates
/docs         these design docs + openapi.json
```

## Milestone 0 — Foundations (infra + CI/CD)
- Monorepo, `docker-compose` (Postgres, Redis, MinIO, API, admin), `.env.example`.
- CI pipeline: lint → typecheck → unit tests → build images. CD: run migrations
  → deploy. Pre-commit hooks, conventional commits.
- **Exit:** `docker compose up` brings up empty stack; CI green on skeleton.

## Milestone 1 — Backend core (auth, RBAC, audit, master data)
- Prisma schema + migrations (Phase 2). Seed super-admin + default org/site.
- Auth: JWT + rotating refresh + reuse detection; Argon2id; `/auth/*`.
- RBAC `PolicyGuard`; AuditInterceptor + audit service; crypto (Aadhaar AES-256-GCM).
- CRUD: organizations, sites, site_settings, shifts, vendors, users, devices.
- **Tests:** unit (guards, crypto, services), integration (auth flows, RBAC scope,
  audit emission). **Exit:** OpenAPI published; 80%+ on core modules.

## Milestone 2 — Workers + credentials
- Worker CRUD, photo upload (S3), credential binding (UID/QR with revoke),
  site assignment history, exit/rehire, lookup/search/emergency endpoints.
- Encrypted Aadhaar write + gated/audited reveal.
- **Tests:** validation, uniqueness (active UID/QR), soft-delete, emergency access
  by all roles. **Exit:** worker lifecycle covered incl. vendor change/rehire.

## Milestone 3 — Attendance engine + sync
- Tap endpoint: resolve → login/logout decision → cooldown → geo → verification
  modes (manual/auto) → photo policy. Redis lock + DB single-open-session index.
- Work-hours engine: daily/monthly/OT/late/early, configurable + overnight shifts.
- Sync batch ingest with idempotency + conflict resolution + auto-close job.
- Supervisor summary endpoint.
- **Tests (heaviest):** unit on cooldown, login/logout decision, hours/overnight,
  DST; integration on idempotency, duplicate taps, cross-site, double-login,
  offline-order conflicts. **Exit:** all Phase 6 backend cases have tests.

## Milestone 4 — Corrections + reports + audit query
- Correction request → approve/reject state machine (mutates only on approve, in
  a transaction, recompute + audit). Stale-request conflict handling.
- Reports (BullMQ): DAILY/MONTHLY/WORKER/VENDOR/SITE/OVERTIME/CORRECTION → XLSX/CSV/PDF.
- Audit query API. **Exit:** approval-gated mutation proven by tests; exports valid.

## Milestone 5 — Admin panel (Next.js)
- Auth (httpOnly cookies + refresh), RBAC-aware shell, generated API client.
- Screens per Phase 5: sites/settings/shifts/devices, workers, attendance,
  corrections approval, reports, audit, users.
- **Tests:** unit (rbac/forms), Playwright E2E (login, worker create, settings,
  approve correction, report). **Exit:** core admin flows E2E green.

## Milestone 6 — Mobile (Flutter)
- Clean arch scaffold, Riverpod, go_router, M3 theme, secure storage, Drift.
- Device registration/authorization; site selection.
- Attendance flow: NFC (NTAG213/215/216, UID+NDEF, locked/empty/corrupt handling),
  QR backup, manual backup (mandatory reason), verification modes, geo, photo.
- Offline outbox + sync engine + conflict surfacing; emergency mode.
- Supervisor scan → summary; correction request creation.
- **Tests:** unit (cooldown, login/logout, hours preview, conflict mapping),
  widget (flows), integration (offline→online, crash/restart durability).
- **Exit:** kill-mid-flow test proves no attendance loss; 80%+ on domain+sync.

## Milestone 7 — Hardening, E2E, deployment
- Full cross-stack E2E happy + edge paths; load test attendance ingest; security
  pass (rate limits, headers, pen-test checklist, dependency audit).
- Production deployment doc: provisioning, secrets/KMS, TLS, backups/PITR,
  migrations, blue-green/rolling deploy, monitoring/alerting, runbooks.
- **Exit:** staging deploy validated end-to-end; runbook reviewed.

## Quality Gates (every milestone)
- Lint + typecheck clean; unit+integration ≥ 80% on touched modules.
- OpenAPI regenerated and committed; client codegen updated.
- New edge cases get a regression test before merge.
- Audit coverage check: every mutating endpoint emits an audit record.

## Risk Register (top)
| Risk | Mitigation |
|---|---|
| Offline sync correctness | idempotency + heavy integration tests + server SoT |
| Time/DST bugs | UTC storage, tz-aware engine, dedicated DST/overnight tests |
| NFC device variance | abstraction layer + QR/manual fallbacks + field test on target hardware |
| PII exposure | field encryption, gated audited reveal, secure storage, scoped RBAC |
| Duplicate/lost attendance | event_id uniqueness + single-open-session index + durable outbox |

---

## Approval Gate (Phase 8)

**No application code will be written until you approve.** On approval, please
confirm or adjust:

1. **Backend ORM:** Prisma (recommended) vs TypeORM.
2. **Mobile local DB:** Drift/SQLite (recommended) vs Isar.
3. **Default org timezone / locale** (assumed `Asia/Kolkata`).
4. **Monorepo** layout above vs separate repos.
5. **Build order:** backend→admin→mobile (recommended) vs parallel tracks.
6. Any changes to roles, settings defaults (countdown 10s, cooldown 30s,
   photo-verify RANDOM 20%), or worker fields.

Once you confirm, I'll begin at **Milestone 0** and proceed milestone by milestone.
