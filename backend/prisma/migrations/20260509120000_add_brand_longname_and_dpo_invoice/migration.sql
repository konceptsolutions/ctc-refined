-- Additive-only: nullable / optional columns (no data rewrite, no drops).

-- Brand.longName -> long_name (see schema @map)
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "long_name" TEXT;

-- DirectPurchaseOrder supplier invoice fields (optional)
ALTER TABLE "DirectPurchaseOrder" ADD COLUMN IF NOT EXISTS "invoiceNo" TEXT;
ALTER TABLE "DirectPurchaseOrder" ADD COLUMN IF NOT EXISTS "invoiceDate" TIMESTAMP(3);
