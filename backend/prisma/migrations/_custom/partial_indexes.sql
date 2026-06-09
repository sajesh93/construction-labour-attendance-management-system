-- Custom indexes/constraints not expressible in Prisma schema.
-- Apply AFTER the baseline `prisma migrate` (or paste into the generated
-- migration's migration.sql). These enforce core invariants from Phase 2/6.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Idempotency on taps is handled by Prisma @@unique([organizationId, eventId]).

-- Only ONE active NFC UID per organization (lost-card reissue safe).
CREATE UNIQUE INDEX IF NOT EXISTS uq_worker_active_uid
  ON workers (organization_id, nfc_uid)
  WHERE nfc_uid IS NOT NULL AND deleted_at IS NULL;

-- Only ONE active QR identifier per organization.
CREATE UNIQUE INDEX IF NOT EXISTS uq_worker_active_qr
  ON workers (organization_id, qr_identifier)
  WHERE qr_identifier IS NOT NULL AND deleted_at IS NULL;

-- Only ONE active credential value per kind.
CREATE UNIQUE INDEX IF NOT EXISTS uq_credential_active
  ON worker_credentials (kind, value)
  WHERE is_active;

-- CRITICAL: only ONE OPEN session per worker (prevents double login).
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_session_per_worker
  ON attendance_sessions (worker_id)
  WHERE state = 'OPEN';

-- Worker search (manual backup): trigram on name, plain on code.
CREATE INDEX IF NOT EXISTS ix_workers_name_trgm
  ON workers USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_workers_code
  ON workers (organization_id, worker_code);

-- Current assignment lookup.
CREATE INDEX IF NOT EXISTS ix_assign_worker_current
  ON worker_site_assignments (worker_id)
  WHERE end_date IS NULL;
