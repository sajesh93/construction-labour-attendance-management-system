-- Username login (watchmen have no email), user soft-delete
ALTER TABLE "users" ADD COLUMN "username" TEXT;
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMPTZ;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- Password reset OTPs (email-based self service)
CREATE TABLE "password_resets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "reset_token_hash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "password_resets_user_id_idx" ON "password_resets"("user_id");
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Devices belong to a user (role-gated approval: admin PCs need a super admin)
ALTER TABLE "devices" ADD COLUMN "user_id" UUID;
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Visitor ID-proof images (encrypted at rest, like Aadhaar images)
ALTER TYPE "PhotoKind" ADD VALUE IF NOT EXISTS 'ID_PROOF';

-- Visitor-only fields
ALTER TABLE "workers" ADD COLUMN "escort_name" TEXT;
ALTER TABLE "workers" ADD COLUMN "visitor_company" TEXT;
ALTER TABLE "workers" ADD COLUMN "id_proof_photo_id" UUID;
