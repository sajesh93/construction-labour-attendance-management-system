# CLAMS — Full Project Context

> A single, self-contained briefing on the **Construction Labour Attendance
> Management System (CLAMS)**. Written to be handed to an LLM (e.g. ChatGPT) as
> background so it can answer questions, draft content, or reason about the system
> without seeing the codebase. Reflects the **actual implemented state** of the
> repository, not just design intent. Differences between the design docs and what
> is really built/deployed are called out explicitly.

---

## 1. What CLAMS is

CLAMS is an **offline-first attendance platform for construction labour across
multiple sites**, built by **Optispace**. Workers carry an **NFC ID card
(NTAG213/215/216) or a printed QR badge** that holds only a worker identifier or
the NFC UID — **never any personal data**. All personal information lives in the
backend.

The flow in one line: a worker taps their card at the gate → a Flutter Android app
records the tap locally and confirms it in ~2 seconds → the tap syncs idempotently
to a NestJS API → the office sees a live head-count and pulls payroll-ready reports
from a Next.js admin panel.

It replaces paper registers, gate head-counts, and the manual spreadsheet work of
turning attendance into payroll.

### The problem it solves
- Attendance lives in a paper notebook at the gate — easy to smudge, lose, or pad.
- Registers can be manipulated; nobody can verify them after the fact.
- Payroll is tallied by hand at month-end; one wrong sum throws off the pay.
- Multiple sites each keep their own register — no single source of truth.
- Reports reach management late, long after they could act.
- No live visibility of who is actually on site right now.

### Core guarantees (non-negotiable principles)
1. **NFC/QR tags hold no PII** — worker ID or UID only.
2. **No attendance loss** — durable on-device outbox + idempotent server ingest.
3. **Everything auditable** — actor · action · old value · new value · timestamp.
4. **Approval gates mutations** — corrections never change attendance until approved.
5. **Sensitive fields encrypted at rest** — Aadhaar, PAN, bank account, Aadhaar photos.
6. **Time correctness** — server-authoritative time, UTC storage, DST/overnight safe.

---

## 2. Monorepo layout

| Path | Component | Stack |
|---|---|---|
| `/backend` | REST API (+ intended background worker) | NestJS 10, Prisma 5, PostgreSQL 16, Redis 7 |
| `/admin` | Admin web panel | Next.js 14 (App Router), TypeScript, MUI 6 |
| `/mobile` | Field app (Android now, iOS later) | Flutter (Material 3), Riverpod, SQLite |
| `/infra` | Local dev orchestration | docker-compose (Postgres, Redis, MinIO) |
| `/docs` | Architecture & design docs (Phases 1–9) | Markdown |
| `/deck` | Client presentation deck | python-pptx build scripts + screenshots |
| `/.github/workflows` | CI + mobile APK build | GitHub Actions |

---

## 3. Tech stack by layer

### Backend (`/backend`)
- **NestJS 10** modular monolith, DDD-lite. URI versioning — all routes under `/api/v1`.
- **Prisma 5** ORM against **PostgreSQL 16**.
- **Redis 7** (ioredis) for distributed locks (per-worker session serialization),
  caching, rate-limit state, and refresh-token families. **BullMQ** is a dependency
  but queue processing is **not yet implemented** (see §15).
- **Auth**: JWT access token (15 min) + rotating opaque refresh token (30 d) with
  reuse detection; `passport-jwt`. **Argon2id** for password/token hashing.
- **RBAC**: roles `SUPER_ADMIN` / `SITE_ADMIN` / `SUPERVISOR` / `WATCHMAN`, evaluated
  per request by a `PolicyGuard` with org/site scoping.
- **Device binding**: attendance endpoints require an `AUTHORIZED` device
  (`X-Device-Id` + `X-Device-Token`).
- **Field encryption**: **AES-256-GCM** for Aadhaar, PAN, bank account, and Aadhaar
  card images (`DATA_ENCRYPTION_KEY`, 32-byte base64).
- **Audit**: append-only log of actor · action · old · new · timestamp · requestId
  on every mutation, via a global interceptor.
- **Validation**: global `ValidationPipe` (`whitelist` + `forbidNonWhitelisted`);
  problem+json error filter; request-id middleware for tracing.
- **Global guards (in order)**: ThrottlerGuard (120 req/60s) → JwtAuthGuard →
  DeviceGuard → PolicyGuard.
- **API docs**: OpenAPI/Swagger UI at `/api/docs`. **Health**: `GET /api/v1/health`.
- Runs as `node dist/main.js`. A worker entrypoint (`node dist/worker.js`) exists in
  code but is not deployed.

### Admin panel (`/admin`)
- **Next.js 14 App Router**, server components + client islands, SSR for fast paint.
- **MUI 6** + `@mui/x-data-grid`, Emotion styling, **TanStack React Query** for data,
  **react-hook-form** + **zod** for forms.
- **QR badge generation** via `qrcode.react`.
- Login route sets a secure **httpOnly cookie**; a server-side proxy
  (`app/api/proxy/[...path]`) forwards to the API so the browser never holds the JWT.
- Two API URLs: `NEXT_PUBLIC_API_BASE_URL` (browser) and `API_INTERNAL_BASE_URL`
  (server-to-server).

### Mobile app (`/mobile`)
- **Flutter** (Material 3), **Clean Architecture** (domain / data / presentation),
  **Riverpod** for DI/state, **go_router** for navigation with reactive auth routing.
- **SQLite via sqflite**: durable local **outbox**, cached workers table, key-value
  metadata. Offline-first; events survive restarts and re-sync idempotently.
- **NFC** read (NTAG213/215/216) via `nfc_manager`; **QR scan** via `mobile_scanner`
  (bundled ML Kit, no Play Services dependency); **Aadhaar Secure QR** via
  `flutter_zxing` (native zxing-cpp on an isolate).
- **Geolocation** (`geolocator`), **flutter_secure_storage** for tokens (Android
  Keystore), **android_id** for a stable device identifier that survives reinstall.
- **FCM** (`firebase_messaging`) + `flutter_local_notifications` +
  `flutter_ringtone_player` for SOS alerts that ring even when the app is closed.
- **Badge printing** on-device via `pdf` + `printing`.
- API base URL baked at build time via `--dart-define=API_BASE_URL=...`.

---

## 4. Architecture & data flow

```
Worker taps NFC/QR card
        │
        ▼
Flutter app ──(writes tap to local SQLite outbox BEFORE any UI success)──► durable, offline-safe
        │
        │  batch sync — each event carries a client-generated eventId (idempotency key)
        ▼
NestJS API  /api/v1/*   (JWT + device-authorized)
        │
        ├─ PostgreSQL 16  ← system of record (workers, sessions, audit, photos)
        └─ Redis 7        ← per-worker locks, cache, rate limit, refresh tokens

Admin (browser) ──► Next.js SSR + server proxy ──► same NestJS API
```

- **Attendance domain**: a tap resolves a worker, then opens or closes a **session**
  (login → logout). A work-hours engine derives daily/monthly totals, overtime, and
  late/early minutes from sessions + per-site shift config.
- **Idempotency** on `eventId` is the backbone of "no loss + no duplicates". A
  per-worker Redis lock (5 s TTL) serialises the login/logout decision.
- **Corrections** follow a request → review → approve/reject state machine;
  attendance is **not** mutated until approval.
- **Multi-tenant**: single database, every query scoped by `organizationId`.
  Per-organization timezone (default `Asia/Kolkata`).

---

## 5. Roles (RBAC)

| Role | Display name | What they can do |
|---|---|---|
| `SUPER_ADMIN` | Super Admin | Everything, incl. vendors, users, storage backup/purge, sensitive-data reveal |
| `SITE_ADMIN` | Site Admin | Manage their sites, workers, attendance, corrections, reports, devices, users, audit (no vendors) |
| `SUPERVISOR` | Safety Officer | Dashboard, attendance view, corrections, report summaries, add/manage workers, view emergency |
| `WATCHMAN` | Watchman | Mobile app only — scan & punch, view limited worker info, raise SOS (no admin panel) |

Sensitive fields (Aadhaar, PAN, bank) are hidden by default and only revealed to
roles with `WORKER_VIEW_SENSITIVE`, with every reveal written to the audit log.

---

## 6. Data model (key entities)

PostgreSQL via Prisma. Highlights (not exhaustive):

- **Organization** — tenant; also holds company profile (address, logo, logo zoom)
  printed on ID cards.
- **Site** — a construction site (name, code, timezone, optional geofence lat/lng/radius).
- **SiteSettings** — per-site verification mode (MANUAL/AUTO), auto-login countdown,
  duplicate-tap cooldown, geo enforcement, photo-verification policy (ALWAYS/NEVER/RANDOM + %).
- **Shift** — start/end time, overnight flag, late/early grace, OT threshold.
- **Vendor** — labour contractor (name, code, contact).
- **Designation** — job role / trade (Mason, Electrician, …), one fixed list.
- **User** — admin/supervisor/watchman accounts with role + site scopes.
- **Device** — a phone/tablet; status PENDING → AUTHORIZED → REVOKED; token hash stored.
- **Worker** — the core person record. `PersonCategory` is **WORKER | STAFF | VISITOR**
  (the same model serves all three). Holds identity, photo, contractor, designation,
  blood group, emergency/nominee contacts, screening/induction dates, validity,
  bank/PF/ESI, and **encrypted** Aadhaar/PAN/bank fields + `*_last4` plaintext hints.
- **WorkerCredential** — NFC UID or QR identifier bound to a worker (revocable).
- **WorkerSiteAssignment** — worker ↔ site ↔ vendor over a date range.
- **AttendanceTap** — one scan event; idempotent on `(organizationId, eventId)`;
  carries source (NFC_UID / NFC_NDEF / QR / MANUAL), client time, geo, photo, etc.
- **AttendanceSession** — a login→logout pair with derived workedMinutes,
  overtimeMinutes, lateMinutes, earlyLeaveMinutes; states OPEN/CLOSED/AUTO_CLOSED/VOID;
  supports cross-site logout.
- **CorrectionRequest** + **CorrectionItem** — proposed field changes (old → new) with
  reason and approval state machine.
- **AuditLog** — append-only; actor, action, entity, old/new JSON, IP, device, requestId.
- **SyncBatch** + **SyncEvent** — record of each offline sync batch and per-event status.
- **PhotoBlob** — **photos are stored in Postgres** (not object storage), compressed
  (sharp, JPEG q80, max edge 1600px); profile photos unencrypted, Aadhaar photos
  encrypted. `kind` = PROFILE / AADHAAR_FRONT / AADHAAR_BACK.
- **SosEvent**, **Notification**, **PushToken** — emergency alerts + FCM tokens.
- **RefreshToken** — rotating refresh-token families with reuse detection.
- **ReportJob** — report metadata (currently completed inline, see §10).

---

## 7. Backend modules & key endpoints

All under `/api/v1`. Selected endpoints:

- **auth** — `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me`,
  `POST /auth/device/register`, `POST /auth/device/token`
- **attendance** — `POST /attendance/tap`, `/attendance/confirm`, `/attendance/sync`,
  `GET /attendance/active`, `/attendance/dashboard-stats`, `/attendance/day-summary`,
  `/attendance/worker/:id/summary`
- **corrections** — `POST /corrections`, `GET /corrections`, `POST /corrections/:id/{approve,reject,cancel}`
- **reports** — `POST /reports`, `POST /reports/preview`, `GET /reports`, `GET /reports/:id`
- **workers** — full CRUD + `GET /workers/{lookup,search,by-site,my-recent}`,
  `:id/emergency`, `:id/credentials`, `:id/assign-site`, `:id/exit`, `:id/rehire`
- **organizations** — `GET/PATCH /organizations/current`, CRUD
- **sites / shifts** — site CRUD, `GET/PUT /sites/:id/settings`, `GET/POST /sites/:id/shifts`, `PATCH /shifts/:id`
- **users** — CRUD + `PUT /users/:id/site-scopes`
- **devices** — `GET /devices`, `PATCH /devices/:id` (authorize/revoke)
- **vendors / designations** — CRUD
- **files** — `POST /files`, `GET /files/:id` (photo upload/serve; compression + optional encryption)
- **audit** — `GET /audit` (filter by entity, actor, action, date range, cursor)
- **notifications** — `GET /notifications`, `POST /notifications/push-token`, `POST /notifications/:id/read`
- **sos** — `POST /sos` (**public, no auth**, throttled), `GET /sos`, `POST /sos/:id/ack`
- **storage** — `GET /storage/usage`, `GET /storage/sites/:id/backup`, `POST /storage/sites/:id/purge`

---

## 8. Admin panel features (pages)

Routes under `admin/app/(dashboard)/`:

- **Dashboard** (`/`) — live KPIs (30 s refresh): "On site right now" by category
  (workers/staff/visitors + total, hover for names), "Missed logout" (yesterday,
  auto-closed sessions), active vs total sites, pending corrections, and a storage alert.
- **Attendance** (`/attendance`) — real-time head-count by category, site-filtered;
  grouped by trade and by contractor; on-site vs missed-logout with session logs.
- **Workers / Staff / Visitors** (`/workers`, `/staff`, `/visitors`) — one shared
  `PeopleDirectory` component. Search/sort/paginate; per-record edit with identity,
  profile photo (upload **or camera capture**), and for workers **Aadhaar front/back
  images** (upload or capture, encrypted at rest), designation, vendor, bank/PF/ESI,
  screening/induction, nominee/emergency, NFC/QR binding. Visitors get QR day-passes.
- **Vendors** (`/vendors`) and **Designations** (`/designations`) — master-data CRUD.
- **Sites** (`/sites`) + **Site Settings** (`/sites/[id]/settings`) — verification mode,
  countdowns, geofence, photo-verification policy, shifts.
- **Devices** (`/devices`) — authorize/revoke phones (pending/authorized/revoked).
- **Users & Roles** (`/users`) — admin accounts, roles, site scopes.
- **Company Details** (`/company`) — name, address, contact, website, logo + zoom
  (printed on ID cards).
- **ID Cards / Badges** (`/workers/badges`) — batch-print two-sided CR80 badges
  (front: identity + photo; back: QR + company + induction/training); filter by
  category/site/search; three sizes.
- **Reports** (`/reports`) — see §10. Live preview (first 500 rows) before download.
- **Corrections** (`/corrections`) — review queue with Pending/Approved/Rejected tabs;
  approve/reject with notes; shows proposed old→new changes.
- **Audit Trail** (`/audit`) — filterable log; expandable before/after JSON, IP, reason.
- **Storage** (`/storage`) — DB usage, per-site breakdown, backup/purge (oldest-first),
  warning/critical thresholds.
- **Login** (`/login`) — email + password; httpOnly session cookies; role-gated nav.

---

## 9. Mobile app features (Flutter, Android)

Key flows (files under `mobile/lib/features/`):

- **Login** (`auth/login_screen.dart`) — email/password; **SOS button available before
  login**. Bootstrap validates session via `/auth/me` and restores role.
- **Site selection** (`site_selection/…`) — pick active site; warms the local worker
  cache for offline punching.
- **Watchman home** (`attendance/.../attendance_home_screen.dart`) — NFC tap, QR scan,
  manual search; shows worker confirmation sheet (photo, code, trade, contractor),
  "LOGIN/LOGOUT recorded" feedback, and a **Synced / N-to-sync** chip in the app bar.
  A clock guard blocks online taps if the phone clock is >10 min skewed (offline taps allowed).
- **QR scan** (`qr_scan_screen.dart`) and **NFC reader** — NTAG213/215/216; UID or
  NDEF worker code; defensive across NFC tech types.
- **Manual search** (`manual_search_sheet.dart`) — search by name/code with a mandatory
  reason for backup entries.
- **Safety-officer/supervisor home** (`supervisor/supervisor_home_screen.dart`) — register
  workers, monthly stats, print badges, verify Aadhaar.
- **Worker registration/edit** (`worker_edit_screen.dart`) — full parity with the admin
  form; auto-generated IDs; **Aadhaar QR autofill** (name/DOB/gender) + photo capture;
  Aadhaar images encrypted before upload.
- **Aadhaar scan/verify** (`aadhaar/…`) — optimised live camera (high res, 2× zoom,
  tap-to-focus, pinch zoom, torch) decoding the dense Aadhaar Secure QR.
- **Supervisor monthly summary** (`supervisor_summary_screen.dart`) — a worker's month:
  hours, overtime, absent days, late marks, day-by-day in/out.
- **Correction requests** (`correction_request_screen.dart`) — raise LOGIN/LOGOUT/MISSING/
  WRONG_SITE corrections with reason + notes for admin approval.
- **Badge printing** (`printing/bulk_print_screen.dart`, `badge_printer.dart`) — CR80
  front+back PDFs printed on-device via the system print dialog; single or bulk.
- **SOS** — confirmation dialog with optional message; sends GPS + device + sender info
  to the public `/sos` endpoint; works offline and logged-out (site resolved by GPS).

### Offline-first details
- Every tap is written to the SQLite **outbox before any UI success**; the login/logout
  decision is computed locally and instantly (no network needed).
- Stable `eventId` per event makes replay safe. `SyncEngine` checks connectivity and
  batches up to **200 events** to `POST /attendance/sync`, handling
  ACCEPTED/DUPLICATE/CONFLICT/REJECTED with retry counters.
- Background sync every ~60 s; worker cache refreshed every ~4 h; manual sync from the app bar.
- Unknown cards (not in cache) are still recorded by identifier and resolve on the server.

---

## 10. Reports

Report types: **DAILY, MONTHLY, WORKER, VENDOR, SITE, OVERTIME, CORRECTION,
ATTENDANCE_SHEET (muster roll)**. Formats: **XLSX (exceljs), CSV, PDF (pdfkit)**.

- **Attendance sheet / muster** — worker rows × per-day columns; either IN/OUT times or
  a **P/A presence grid** (`attendanceMode: 'PRESENCE'`); government-style info block
  (SL no, name, father's name, EMP-ID, contractor, nature of contractor, DOB, joining
  date, gender, mobile). Respects join/exit dates. Multi-month ranges supported.
- **Full profile with PII** — when `includeSensitive=true` **and** the user has
  `WORKER_VIEW_SENSITIVE`, decrypts and appends Aadhaar, PAN, bank account, IFSC,
  PF/ESI, emergency contact, etc. Every such run is audited as `WORKER_AADHAAR_REVEAL`.
- Optional vendor sorting. Reports currently render **inline/synchronously** (the
  `ReportJob` is created already `DONE`); there is no async queue yet.

---

## 11. Security

- **Encryption at rest**: AES-256-GCM for Aadhaar, PAN, bank account, and Aadhaar card
  images. Blob layout `[12-byte IV][16-byte auth tag][ciphertext]`; random IV per
  field; key from `DATA_ENCRYPTION_KEY` (the app refuses to start without it). Only the
  **last 4 digits** of Aadhaar/PAN/bank are kept readable. Single shared key per
  environment; manual rotation (no key versioning yet).
- **Passwords & tokens** hashed with **Argon2id** (never stored in plaintext).
- **Auth**: 15-min JWT access + 30-day rotating refresh tokens with **reuse detection**
  (replaying a revoked token revokes the whole token family).
- **Device authorization**: only admin-approved phones (`AUTHORIZED` status) with a
  valid device token can mark attendance; lost phones revoked in one tap.
- **RBAC** per request; sensitive data hidden by default and revealed only to seniors,
  with the reveal logged.
- **Audit log** is append-only and covers logins, CRUD, corrections, credential binds,
  Aadhaar reveals, backups, purges (50+ event types) with before/after values and IP.
- **Transport**: HTTPS everywhere (managed TLS at the Azure ingress).

---

## 12. SOS & emergency alerts

- `POST /sos` is **public** (works when logged out / app closed), throttled (~5/min,
  15 s cooldown per device).
- The backend resolves the site from: explicit `siteId` → nearest site by GPS (within
  ~10 km) → the device's registered site → the org's first site.
- On trigger: stores a `SosEvent`, creates an in-app notification, and **fire-and-forget**
  fans out an **FCM push** to every org device (except the sender) and an **email** to
  all site admins + safety officers. SOS response never blocks on these.
- The mobile app rings a high-importance siren channel (full-screen intent, ALARM audio,
  vibration) even when locked/closed. FCM requires `FIREBASE_SERVICE_ACCOUNT` on the API
  and `google-services.json` baked into the APK to be active.

---

## 13. Storage management

Because photos and attendance live in Postgres, storage is actively managed:

- Photos uploaded via `POST /files` are compressed with **sharp** (max edge 1600px,
  JPEG q80, EXIF stripped); 10 MB input cap. Profile photos unencrypted; Aadhaar
  photos encrypted.
- `GET /storage/usage` reports DB size vs `DB_STORAGE_LIMIT_BYTES` with OK (<80%) /
  WARNING (80–90%) / CRITICAL (≥90%) levels and a **per-site breakdown** of image and
  attendance bytes.
- **Backup** (`GET /storage/sites/:id/backup`, Super Admin) exports a multi-sheet XLSX
  (workers with decrypted sensitive fields, attendance, vendors), audited as
  `SITE_DATA_BACKUP`.
- **Purge** (`POST /storage/sites/:id/purge`, Super Admin) deletes that site's sessions,
  taps, and photos of workers assigned exclusively to it — **only if a backup was taken
  within the last 30 minutes** — audited as `SITE_DATA_PURGE`. Worker master records are kept.

---

## 14. Deployment & CI/CD (live on Azure)

Live environment captured 2026-06-10, all in resource group **`clams-rg`**, region
**Central India**, on **Azure Container Apps**.

| Resource | Role |
|---|---|
| `clams-env` | Container Apps managed environment (ingress + managed TLS + Log Analytics) |
| `clams-api` | NestJS API container (external ingress; base path `/api/v1`) |
| `clams-admin` | Next.js admin container (external ingress) |
| `clams-redis` | Redis 7 container (internal only, **ephemeral**, not Azure Cache) |
| `clams-pg-8ca7` | PostgreSQL 16 Flexible Server (Burstable B1ms, 32 GB, 7-day backups, **no HA**) |
| `clamsacr8ca7` | Azure Container Registry (Basic) — stores API/admin images |
| `workspace-clamsrglZYq` | Log Analytics workspace |

- Public endpoints: API and Admin are `https://clams-{api,admin}.lemoncoast-….centralindia.azurecontainerapps.io`.
- API/admin/Redis pinned at **1 replica** (no autoscale today). Cost-minimal single-tenant setup.
- API env vars: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
  `DATA_ENCRYPTION_KEY`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `API_PORT`, `NODE_ENV`,
  `CORS_ORIGINS` (+ optional `FIREBASE_SERVICE_ACCOUNT`, `DB_STORAGE_LIMIT_BYTES`).
- **CI** (`.github/workflows/ci.yml`): backend (Postgres+Redis service containers →
  prisma generate → migrate deploy → lint → test:cov → build), admin (lint → vitest →
  next build), mobile (flutter analyze + test).
- **Mobile APK** (`.github/workflows/mobile-apk.yml`): `flutter build apk --release`
  with the API URL baked in; R8 minification disabled (fixes a `mobile_scanner` null-ref).
- Image build/push to ACR, deploy to Container Apps by digest. DB migrations run as a
  **separate deploy step** (the container `CMD` only runs the API to avoid advisory-lock
  contention).
- Local dev (`infra/docker-compose.yml`): Postgres 16, Redis 7, and **MinIO** (S3) + the
  api/admin images. `cp infra/.env.example infra/.env` then `docker compose up -d`.

---

## 15. Current gaps / things NOT yet built

Be accurate about these when reasoning — the code supports more than is deployed/enabled:

- **No object storage in prod.** Worker/Aadhaar photos are stored **in PostgreSQL**
  (`PhotoBlob`), not S3/Blob. MinIO is dev-only. This is why storage management (§13) exists.
- **No background worker / BullMQ jobs.** `dist/worker.js` and BullMQ are present but no
  queue consumers run. Report generation is **synchronous/inline**, not queued.
- **No horizontal scale / HA.** API, admin, and Redis are single-replica; Postgres HA is off.
- **Redis is ephemeral** — a restart drops refresh-token families and locks.
- **No separate reverse proxy** — Azure Container Apps provides ingress/TLS natively.
- **Single shared encryption key**, manual rotation (no per-tenant keys or key versioning).

These are deliberate cost-minimal deployment choices, not code limitations.

---

## 16. Roadmap / "what's next" (proposed, not built)

- **AI safety camera** — a wearable/phone camera that flags missing PPE (helmet, vest,
  dust mask, glasses, ear/eye protection), timestamps and geotags the photo, and (when a
  face is visible) matches it to a worker; office gets an instant alert. Proposed stack:
  YOLO for PPE detection + a face-recognition library, run on-prem (faces not sent
  outside), with a managed option (AWS) for a quicker start. Phased: start with the
  officer's phone on a body holder, small single-site pilot, privacy-respecting retention.
- **Modular expansion** — inventory/stock, compliance, procurement, payroll modules that
  reuse the shared base (auth, roles, photos, alerts, audit).

---

## 17. Glossary

- **Tap** — a single card scan event (NFC or QR).
- **Session** — a login→logout pair for one worker on one work date; carries derived hours/OT/late.
- **Outbox** — the durable on-device queue of taps awaiting sync.
- **Correction** — a requested edit to attendance, applied only after admin approval.
- **Muster / attendance sheet** — the government-format present/absent (P/A) monthly roll.
- **Worker category** — WORKER, STAFF, or VISITOR (same data model, different rules/passes).
- **Device authorization** — admin approval that lets a specific phone mark attendance.

---

_Last assembled: June 2026. Reflects the repository's actual implemented state, with
design-vs-deployment gaps called out in §15._
