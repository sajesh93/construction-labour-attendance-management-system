-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'SITE_ADMIN', 'WATCHMAN', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXITED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'REVOKED');

-- CreateEnum
CREATE TYPE "SessionState" AS ENUM ('OPEN', 'CLOSED', 'AUTO_CLOSED', 'VOID');

-- CreateEnum
CREATE TYPE "TapType" AS ENUM ('LOGIN', 'LOGOUT');

-- CreateEnum
CREATE TYPE "TapSource" AS ENUM ('NFC_UID', 'NFC_NDEF', 'QR', 'MANUAL');

-- CreateEnum
CREATE TYPE "VerificationMode" AS ENUM ('MANUAL', 'AUTO');

-- CreateEnum
CREATE TYPE "PhotoVerifyMode" AS ENUM ('ALWAYS', 'NEVER', 'RANDOM');

-- CreateEnum
CREATE TYPE "CorrectionType" AS ENUM ('LOGIN', 'LOGOUT', 'MISSING', 'WRONG_SITE');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CorrectionReason" AS ENUM ('FORGOT_CARD', 'DEVICE_ISSUE', 'NETWORK_ISSUE', 'WRONG_SITE', 'SUPERVISOR_MISTAKE', 'OTHER');

-- CreateEnum
CREATE TYPE "SyncEventStatus" AS ENUM ('ACCEPTED', 'DUPLICATE', 'CONFLICT', 'REJECTED');

-- CreateEnum
CREATE TYPE "CredentialKind" AS ENUM ('NFC_UID', 'QR');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geofence_radius_m" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contact_person" TEXT,
    "contact_number" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_site_scopes" (
    "user_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,

    CONSTRAINT "user_site_scopes_pkey" PRIMARY KEY ("user_id","site_id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "site_id" UUID,
    "device_uid" TEXT NOT NULL,
    "label" TEXT,
    "platform" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'PENDING',
    "token_hash" TEXT,
    "authorized_by" UUID,
    "authorized_at" TIMESTAMPTZ,
    "last_seen_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "worker_code" TEXT NOT NULL,
    "nfc_uid" TEXT,
    "qr_identifier" TEXT,
    "full_name" TEXT NOT NULL,
    "photo_url" TEXT,
    "mobile_number" TEXT,
    "blood_group" TEXT,
    "emergency_contact_name" TEXT,
    "emergency_contact_number" TEXT,
    "vendor_id" UUID,
    "pf_number" TEXT,
    "esi_number" TEXT,
    "aadhaar_ciphertext" BYTEA,
    "aadhaar_last4" TEXT,
    "status" "WorkerStatus" NOT NULL DEFAULT 'ACTIVE',
    "join_date" DATE,
    "exit_date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_site_assignments" (
    "id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "vendor_id" UUID,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_site_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_credentials" (
    "id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "kind" "CredentialKind" NOT NULL,
    "value" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "issued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,
    "reason" TEXT,

    CONSTRAINT "worker_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "is_overnight" BOOLEAN NOT NULL DEFAULT false,
    "late_grace_minutes" INTEGER NOT NULL DEFAULT 0,
    "early_grace_minutes" INTEGER NOT NULL DEFAULT 0,
    "ot_threshold_minutes" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "site_id" UUID NOT NULL,
    "verification_mode" "VerificationMode" NOT NULL DEFAULT 'MANUAL',
    "auto_login_countdown_seconds" INTEGER NOT NULL DEFAULT 10,
    "duplicate_tap_cooldown_seconds" INTEGER NOT NULL DEFAULT 30,
    "geo_enforcement" BOOLEAN NOT NULL DEFAULT false,
    "geo_radius_meters" INTEGER NOT NULL DEFAULT 200,
    "photo_verification_mode" "PhotoVerifyMode" NOT NULL DEFAULT 'RANDOM',
    "photo_verification_random_pct" INTEGER NOT NULL DEFAULT 20,
    "default_shift_id" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("site_id")
);

-- CreateTable
CREATE TABLE "attendance_taps" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "device_id" UUID,
    "worker_id" UUID,
    "raw_identifier" TEXT,
    "tap_source" "TapSource" NOT NULL,
    "tap_type" "TapType",
    "client_event_time" TIMESTAMPTZ NOT NULL,
    "server_received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monotonic_ms" BIGINT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geo_accuracy_m" DOUBLE PRECISION,
    "verified_mode" "VerificationMode",
    "photo_captured_url" TEXT,
    "is_manual_backup" BOOLEAN NOT NULL DEFAULT false,
    "manual_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_taps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "shift_id" UUID,
    "work_date" DATE NOT NULL,
    "login_tap_id" UUID,
    "logout_tap_id" UUID,
    "login_at" TIMESTAMPTZ NOT NULL,
    "logout_at" TIMESTAMPTZ,
    "state" "SessionState" NOT NULL DEFAULT 'OPEN',
    "worked_minutes" INTEGER,
    "overtime_minutes" INTEGER,
    "late_minutes" INTEGER,
    "early_leave_minutes" INTEGER,
    "logout_site_id" UUID,
    "is_cross_site" BOOLEAN NOT NULL DEFAULT false,
    "closed_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "session_id" UUID,
    "work_date" DATE NOT NULL,
    "type" "CorrectionType" NOT NULL,
    "reason" "CorrectionReason" NOT NULL,
    "notes" TEXT,
    "requested_by" UUID NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "review_notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "correction_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_items" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "proposed_value" JSONB NOT NULL,
    "previous_value" JSONB,

    CONSTRAINT "correction_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "organization_id" UUID,
    "actor_user_id" UUID,
    "actor_role" "UserRole",
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "old_value" JSONB,
    "new_value" JSONB,
    "reason" TEXT,
    "ip_address" TEXT,
    "device_id" UUID,
    "request_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_batches" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_count" INTEGER NOT NULL,
    "accepted" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "conflicts" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sync_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_events" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "status" "SyncEventStatus" NOT NULL,
    "detail" TEXT,
    "tap_id" UUID,

    CONSTRAINT "sync_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "device_id" UUID,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "replaced_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "report_type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "result_url" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "report_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sites_organization_id_code_key" ON "sites"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_organization_id_code_key" ON "vendors"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "devices_organization_id_device_uid_key" ON "devices"("organization_id", "device_uid");

-- CreateIndex
CREATE INDEX "workers_organization_id_mobile_number_idx" ON "workers"("organization_id", "mobile_number");

-- CreateIndex
CREATE UNIQUE INDEX "workers_organization_id_worker_code_key" ON "workers"("organization_id", "worker_code");

-- CreateIndex
CREATE INDEX "attendance_taps_worker_id_client_event_time_idx" ON "attendance_taps"("worker_id", "client_event_time" DESC);

-- CreateIndex
CREATE INDEX "attendance_taps_site_id_server_received_at_idx" ON "attendance_taps"("site_id", "server_received_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_taps_organization_id_event_id_key" ON "attendance_taps"("organization_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_login_tap_id_key" ON "attendance_sessions"("login_tap_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_logout_tap_id_key" ON "attendance_sessions"("logout_tap_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_worker_id_work_date_idx" ON "attendance_sessions"("worker_id", "work_date");

-- CreateIndex
CREATE INDEX "attendance_sessions_site_id_work_date_idx" ON "attendance_sessions"("site_id", "work_date");

-- CreateIndex
CREATE INDEX "correction_requests_status_organization_id_idx" ON "correction_requests"("status", "organization_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_site_scopes" ADD CONSTRAINT "user_site_scopes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_site_scopes" ADD CONSTRAINT "user_site_scopes_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workers" ADD CONSTRAINT "workers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workers" ADD CONSTRAINT "workers_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_site_assignments" ADD CONSTRAINT "worker_site_assignments_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_site_assignments" ADD CONSTRAINT "worker_site_assignments_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_site_assignments" ADD CONSTRAINT "worker_site_assignments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_credentials" ADD CONSTRAINT "worker_credentials_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_default_shift_id_fkey" FOREIGN KEY ("default_shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_taps" ADD CONSTRAINT "attendance_taps_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_taps" ADD CONSTRAINT "attendance_taps_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_login_tap_id_fkey" FOREIGN KEY ("login_tap_id") REFERENCES "attendance_taps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_logout_tap_id_fkey" FOREIGN KEY ("logout_tap_id") REFERENCES "attendance_taps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_items" ADD CONSTRAINT "correction_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "correction_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_events" ADD CONSTRAINT "sync_events_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "sync_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============ Custom partial/trigram indexes (Phase 2/6) ============
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

