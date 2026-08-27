-- AlterTable
ALTER TABLE "SalesQuotationItem" ADD COLUMN IF NOT EXISTS "divOn" TEXT;
ALTER TABLE "SalesQuotationItem" ADD COLUMN IF NOT EXISTS "qtyDiv" INTEGER NOT NULL DEFAULT 0;

-- Backfill: existing rows use quotation qty as the divisible qty so initiate keeps prior behavior
UPDATE "SalesQuotationItem" SET "qtyDiv" = "quantity" WHERE "qtyDiv" = 0 AND "quantity" > 0;
