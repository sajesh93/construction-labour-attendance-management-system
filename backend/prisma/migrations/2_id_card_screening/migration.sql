-- ID card: screening details and ID validity printed on the screening card.
ALTER TABLE "workers"
  ADD COLUMN "screening_done_on" DATE,
  ADD COLUMN "screening_done_by" TEXT,
  ADD COLUMN "validity_till" DATE;
