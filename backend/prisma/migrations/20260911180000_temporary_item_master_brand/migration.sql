ALTER TABLE "PurchaseImportRequestItem"
  ADD COLUMN IF NOT EXISTS "tempMasterPartNo" TEXT,
  ADD COLUMN IF NOT EXISTS "tempBrand" TEXT;

ALTER TABLE "PurchaseQuotationItem"
  ADD COLUMN IF NOT EXISTS "tempMasterPartNo" TEXT,
  ADD COLUMN IF NOT EXISTS "tempBrand" TEXT;

ALTER TABLE "SalesQuotationItem"
  ADD COLUMN IF NOT EXISTS "tempMasterPartNo" TEXT,
  ADD COLUMN IF NOT EXISTS "tempBrand" TEXT;
