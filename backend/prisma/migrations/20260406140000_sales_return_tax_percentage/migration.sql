ALTER TABLE "SalesReturn" ADD COLUMN IF NOT EXISTS "taxPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE "SalesReturn"
SET "taxPercentage" = ROUND(("tax" / NULLIF("subtotal", 0))::numeric * 100)::double precision
WHERE "subtotal" > 0 AND "tax" > 0;
