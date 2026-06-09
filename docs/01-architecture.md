# Phase 1 — Architecture Document

## 1. Architectural Style

| Layer | Style | Rationale |
|-------|-------|-----------|
| Mobile | Clean Architecture + Riverpod, offline-first | Testable, shared Android/iOS code, resilient to network loss |
| Backend | Modular monolith (NestJS modules), DDD-lite | Single deployable, clear module boundaries, can split to services later |
| Admin | Next.js App Router, server components + client islands | SSR for fast first paint, secure server-side token handling |
| Data | PostgreSQL (system of record) + Redis (ephemeral) | ACID for attendance/audit, Redis for locks/cache/queues |

A **modular monolith** is chosen over microservices: the domain is cohesive
(attendance), the team is small, and transactional integrity across
worker/attendance/audit is much simpler in one database. Module boundaries are
kept clean so extraction is possible later.

## 2. Backend Module Breakdown (NestJS)

```
src/
├── app.module.ts
├── common/                 # cross-cutting: guards, interceptors, filters, decorators
│   ├── auth/               # JWT strategy, refresh, device guard
│   ├── rbac/               # roles, permissions, policy guard
│   ├── audit/              # audit interceptor + service
│   ├── crypto/             # field encryption (Aadhaar), hashing
│   ├── idempotency/        # idempotency-key handling for sync
│   ├── time/               # server time, timezone, shift math
│   └── errors/             # exception filter, problem+json
├── modules/
│   ├── organizations/
│   ├── sites/
│   ├── vendors/
│   ├── workers/
│   ├── users/              # admins, supervisors, watchmen accounts
│   ├── devices/            # device registration + authorization
│   ├── attendance/         # sessions, taps, work-hours engine
│   ├── corrections/        # correction request workflow
│   ├── settings/           # attendance config per site/org
│   ├── sync/               # batch ingest, conflict resolution
│   ├── reports/            # report generation + export
│   └── audit/              # query API for audit trail
└── infra/
    ├── prisma|typeorm/     # ORM (see §6)
    ├── redis/
    └── storage/            # S3-compatible client
```

### Module responsibilities

- **organizations / sites / vendors / workers / users** — master-data CRUD with RBAC.
- **devices** — register a physical device, issue a device token, allow admin to
  authorize/revoke. Attendance is only accepted from authorized devices.
- **attendance** — the core: open/close sessions, duplicate-tap cooldown,
  geo capture, work-hours engine.
- **corrections** — request → review → approve/reject state machine; nothing
  mutates attendance until approval.
- **settings** — per-org and per-site configuration (verification mode,
  countdown, cooldown, geo enforcement, photo-verify policy, shifts).
- **sync** — accepts offline batches, deduplicates by client event id, resolves
  conflicts, returns authoritative results.
- **reports** — async generation, export to Excel/CSV/PDF, stored in object store.
- **audit** — append-only log, queryable by admins.

## 3. Cross-Cutting Concerns

### 3.1 Authentication
- **JWT access token** (short-lived, e.g. 15 min) + **refresh token** (long-lived,
  rotating, stored hashed in Redis + DB allow-list).
- Refresh rotation with reuse detection: a replayed refresh token revokes the
  whole token family.
- Mobile stores tokens in **secure storage** (Android Keystore / iOS Keychain via
  `flutter_secure_storage`).
- **Device-bound tokens**: attendance endpoints require a valid `device_id` whose
  status is `AUTHORIZED`.

### 3.2 Authorization (RBAC)
Roles: `SUPER_ADMIN`, `SITE_ADMIN`, `WATCHMAN`, `SUPERVISOR`.

Permission model = **role → permission set**, plus **scope** (org / site).
A `PolicyGuard` evaluates `(permission, scope)` per request. Example matrix:

| Permission | Super Admin | Site Admin | Watchman | Supervisor |
|---|:--:|:--:|:--:|:--:|
| org.manage | ✅ | — | — | — |
| site.manage | ✅ | ✅ (assigned) | — | — |
| vendor.manage | ✅ | — | — | — |
| worker.manage | ✅ | ✅ (site scope) | — | — |
| worker.view.limited | ✅ | ✅ | ✅ | ✅ |
| attendance.mark | ✅ | — | ✅ | — |
| attendance.view | ✅ | ✅ | limited | ✅ |
| attendance.edit | ✅ | — | ❌ | ❌ |
| payroll.view | ✅ | ✅ | ❌ | ❌ |
| settings.manage | ✅ | partial | — | — |
| correction.request | ✅ | ✅ | — | ✅ |
| correction.approve | ✅ | partial | — | — |
| reports.all | ✅ | site-scoped | — | summary only |
| emergency.view | ✅ | ✅ | ✅ | ✅ |

> **Emergency data** (blood group, emergency contact/phone) is readable by *every*
> authenticated role regardless of other limits — see Emergency Mode.

### 3.3 Audit Logging
- An `AuditInterceptor` wraps all mutating commands. Services emit explicit audit
  events for domain actions (more meaningful than raw HTTP).
- Stored fields: `actor_user_id`, `actor_role`, `action`, `entity_type`,
  `entity_id`, `old_value (jsonb)`, `new_value (jsonb)`, `reason`, `ip`,
  `device_id`, `created_at`, `request_id`.
- Append-only (no UPDATE/DELETE grant on the table for app role); partitioned by month.

### 3.4 Encryption
- **At rest in DB**: Aadhaar and other flagged fields encrypted with
  **AES-256-GCM** using a key from a KMS/secret manager (envelope encryption:
  data key per row encrypted by master key). Stored as `ciphertext || iv || tag`.
- **In transit**: TLS everywhere; HSTS on web.
- **Hashing**: passwords with Argon2id; NFC UID stored as-is (not secret) but
  Aadhaar last-4 may be stored as a separate searchable hash if needed.

### 3.5 Time & Timezone
- Server is authoritative for time. All timestamps stored in **UTC** (`timestamptz`).
- Each **site** has an IANA timezone (e.g. `Asia/Kolkata`). Shift math and reports
  render in site-local time.
- Clients send their wall-clock + monotonic timestamp; server records both
  `client_event_time` and `server_received_time` to detect **clock tampering**.

### 3.6 Idempotency
- Every offline-originated write carries a client-generated `event_id` (UUID v4)
  and an `Idempotency-Key`. The server dedupes on `event_id`; replays return the
  original result. This is the backbone of "no attendance loss + no duplicates."

### 3.7 Caching (Redis)
- Worker lookup-by-UID cache (short TTL) for fast tap resolution.
- Site settings cache.
- Distributed locks for session open/close (`SETNX` on `worker:{id}:session`).
- Rate limiting (per device/user).
- Refresh-token family store.
- Report job queue (BullMQ).

## 4. Attendance Domain Model (conceptual)

```
Tap (event)  ──► resolves Worker ──► evaluates active Session for (worker, day, site)
   │                                          │
   │                          ┌───────────────┴───────────────┐
   │                          │ no open session                │ open session exists
   ▼                          ▼                                ▼
cooldown check         OPEN session (login)            CLOSE session (logout)
(reject if within         capture geo/device              compute hours
 cooldown window)         verification mode               overtime/late/early
```

A **Session** = one login→logout pair. Work-hours engine derives daily/monthly
totals, overtime, late arrival, early departure from sessions + shift config.

## 5. Configuration Surface (admin-tunable)

| Setting | Scope | Default |
|---|---|---|
| verification_mode | site | `MANUAL` (or `AUTO`) |
| auto_login_countdown_seconds | site | 10 |
| duplicate_tap_cooldown_seconds | site | 30 |
| geo_enforcement | site | disabled |
| geo_radius_meters | site | 200 |
| photo_verification_mode | site | `RANDOM` |
| photo_verification_random_pct | site | 20 |
| shift definitions (incl. overnight) | site | configurable |
| late_grace_minutes / early_grace_minutes | shift | configurable |

## 6. Technology Decisions & Trade-offs

| Decision | Choice | Why / Alternative |
|---|---|---|
| ORM | **Prisma** | Type-safe, great migrations DX. Alt: TypeORM (more mature decorators but rougher migrations). |
| Job queue | **BullMQ (Redis)** | Reports + sync post-processing. |
| File storage | **S3-compatible** (MinIO in dev) | Worker photos, report exports. |
| API docs | **OpenAPI 3.1** via Nest Swagger | Contract-first-ish, generated client for admin/mobile. |
| Mobile DB | **Drift (SQLite)** | Robust offline store + queryable; alt: Isar. |
| Mobile state | **Riverpod** (required) | Compile-safe DI + testability. |

## 7. Deployment Topology (summary; full doc in Phase 7)

```
Internet → Reverse proxy (nginx/Traefik, TLS) →
  ├─ NestJS API (N replicas, stateless)
  ├─ Next.js Admin (SSR)
  ├─ PostgreSQL (primary + optional replica, PITR backups)
  ├─ Redis (persistence enabled / managed)
  ├─ Worker process (BullMQ consumers for reports/sync)
  └─ Object storage (S3 / MinIO)
```
All containerized with Docker; environments via `.env` + secret manager; CI/CD
pipeline lints, tests, builds images, runs migrations, deploys.
