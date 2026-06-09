# Construction Labour Attendance Management System (CLAMS)

Production-grade, offline-first attendance platform for construction labour across
multiple sites. NFC ID cards (NTAG213/215/216) carry only a Worker ID or UID — all
PII lives in the backend.

## Monorepo Layout

```
/backend   NestJS API + workers (PostgreSQL, Redis, S3)
/admin     Next.js admin panel (TypeScript, MUI)
/mobile    Flutter app (Android now, iOS later)
/infra     docker-compose, Dockerfiles, deployment docs
/docs      architecture & design documents (Phases 1–7)
```

## Tech Stack

| Area | Tech |
|---|---|
| Mobile | Flutter (Material 3), Riverpod, Clean Architecture, Drift/SQLite, NFC, QR |
| Backend | NestJS, Prisma, PostgreSQL, Redis, BullMQ, JWT + RBAC |
| Admin | Next.js (App Router), TypeScript, MUI |
| Infra | Docker, docker-compose, CI/CD |

## Quick Start (dev)

```bash
cp infra/.env.example infra/.env
docker compose -f infra/docker-compose.yml up -d   # postgres, redis, minio
cd backend && npm install && npm run prisma:migrate && npm run start:dev
cd admin   && npm install && npm run dev
cd mobile  && flutter pub get && flutter run
```

## Documentation

See [`docs/`](./docs) for the full architecture (Phase 1), database schema
(Phase 2), API contracts (Phase 3), mobile (Phase 4) and admin (Phase 5)
architecture, edge cases (Phase 6), and the implementation plan (Phase 7).

## Core Guarantees

1. NFC tags store no PII (Worker ID or UID only).
2. No attendance loss — durable local outbox + idempotent server ingest.
3. Everything auditable — user · action · old · new · timestamp.
4. Corrections never mutate attendance until approved.
5. Sensitive fields (Aadhaar) encrypted at rest.
6. Server-authoritative time; UTC storage; DST/overnight safe.
