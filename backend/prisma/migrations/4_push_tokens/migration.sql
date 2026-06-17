-- FCM device tokens for SOS push notifications.
CREATE TABLE "push_tokens" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID,
  "device_uid" TEXT,
  "token" TEXT NOT NULL,
  "platform" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens" ("token");
CREATE INDEX "push_tokens_organization_id_idx" ON "push_tokens" ("organization_id");
