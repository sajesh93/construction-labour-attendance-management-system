# Construction Labour Attendance Management System (CLAMS)

> **Status:** DESIGN PHASE — no application code is to be written until Phase 1–7 are approved.

## Document Index

| Phase | Document | Purpose |
|-------|----------|---------|
| 1 | [01-architecture.md](./01-architecture.md) | System architecture, components, cross-cutting concerns |
| 2 | [02-database-schema.md](./02-database-schema.md) | ER diagram, PostgreSQL schema, indexes, constraints, migrations |
| 3 | [03-api-contracts.md](./03-api-contracts.md) | OpenAPI surface, request/response contracts, validation, errors |
| 4 | [04-mobile-architecture.md](./04-mobile-architecture.md) | Flutter clean architecture, offline-first, NFC/QR, sync engine |
| 5 | [05-admin-panel-architecture.md](./05-admin-panel-architecture.md) | Next.js admin panel architecture |
| 6 | [06-edge-cases.md](./06-edge-cases.md) | Full edge-case catalogue + resolution strategy |
| 7 | [07-implementation-plan.md](./07-implementation-plan.md) | Milestones, sequencing, estimates, acceptance criteria |
| 7 | [08-deployment.md](./08-deployment.md) | Production deployment, security hardening, runbooks, DR |

## System Goals

A production-grade attendance platform for construction labour across multiple
sites. Workers carry **NFC ID cards** (NTAG213/215/216) that store **only** a
worker identifier or the NFC UID — never PII. All worker data lives in the
backend. The mobile app is **offline-first**: attendance is never lost, even
through device restart, app crash, or network loss.

## Component Map

```
┌────────────────────────────────────────────────────────────────────┐
│                          CLIENTS                                      │
│                                                                       │
│  ┌──────────────────────────┐        ┌──────────────────────────┐    │
│  │  Flutter Mobile App       │        │  Next.js Admin Panel      │   │
│  │  (Android now, iOS later) │        │  (Super/Site Admin,       │   │
│  │  Watchman + Supervisor    │        │   Supervisor read views)  │   │
│  │  Offline-first / NFC / QR │        │  MUI + TypeScript         │   │
│  └────────────┬─────────────┘        └────────────┬─────────────┘     │
│               │ HTTPS / JWT                        │ HTTPS / JWT       │
└───────────────┼────────────────────────────────────┼─────────────────┘
                │                                      │
        ┌───────▼──────────────────────────────────────▼───────┐
        │              NestJS Backend (API Gateway)              │
        │  Auth · RBAC · Attendance · Sync · Reports · Audit     │
        └───────┬───────────────────┬───────────────────┬───────┘
                │                   │                   │
        ┌───────▼──────┐   ┌────────▼───────┐   ┌───────▼────────┐
        │ PostgreSQL    │   │ Redis           │   │ Object Store   │
        │ (source of    │   │ (cache, locks,  │   │ (worker photos,│
        │  truth)       │   │  rate limit,    │   │  report exports)│
        │               │   │  refresh tokens)│   │  S3-compatible │
        └───────────────┘   └─────────────────┘   └────────────────┘
```

## Non-Negotiable Principles

1. **NFC tags hold no PII.** Worker ID or UID only.
2. **No attendance loss.** Offline writes are durable and idempotent.
3. **Everything auditable.** user · action · old value · new value · timestamp.
4. **Approval gates mutations.** Corrections never apply until approved.
5. **Encryption of sensitive fields.** Aadhaar and similar are encrypted at rest.
6. **Time correctness.** Server-authoritative time, UTC storage, DST/overnight safe.
