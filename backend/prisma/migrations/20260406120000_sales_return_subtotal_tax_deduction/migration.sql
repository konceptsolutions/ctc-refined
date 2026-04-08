-- AlterTable
ALTER TABLE "SalesReturn" ADD COLUMN "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "deduction" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE "SalesReturn" sr
SET "subtotal" = sub.item_sum
FROM (
  SELECT "salesReturnId", COALESCE(SUM("amount"), 0)::double precision AS item_sum
  FROM "SalesReturnItem"
  GROUP BY "salesReturnId"
) sub
WHERE sr.id = sub."salesReturnId";
