-- Allow temporary (non-catalog) line items on import inquiry / purchase quotation / sales quotation.
ALTER TABLE "PurchaseImportRequestItem"
  ALTER COLUMN "partId" DROP NOT NULL;
ALTER TABLE "PurchaseImportRequestItem"
  ADD COLUMN IF NOT EXISTS "isTemporary" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "tempPartNo" TEXT,
  ADD COLUMN IF NOT EXISTS "tempDescription" TEXT;

ALTER TABLE "PurchaseQuotationItem"
  ALTER COLUMN "partId" DROP NOT NULL;
ALTER TABLE "PurchaseQuotationItem"
  ADD COLUMN IF NOT EXISTS "isTemporary" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "tempPartNo" TEXT,
  ADD COLUMN IF NOT EXISTS "tempDescription" TEXT;

ALTER TABLE "SalesQuotationItem"
  ALTER COLUMN "partId" DROP NOT NULL;
ALTER TABLE "SalesQuotationItem"
  ADD COLUMN IF NOT EXISTS "isTemporary" BOOLEAN NOT NULL DEFAULT false;

-- Sales quotation already has partNo/description for display of temp lines.
