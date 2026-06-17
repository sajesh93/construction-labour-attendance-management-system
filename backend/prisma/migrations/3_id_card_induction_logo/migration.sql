-- Induction details printed on the screening/induction card.
ALTER TABLE "workers"
  ADD COLUMN "induction_done_on" DATE,
  ADD COLUMN "inducted_by" TEXT;

-- Print-time logo zoom for the ID card (1 = fit to box).
ALTER TABLE "organizations"
  ADD COLUMN "logo_scale" DOUBLE PRECISION NOT NULL DEFAULT 1;
