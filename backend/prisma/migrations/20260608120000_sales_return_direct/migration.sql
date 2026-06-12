-- Direct sales return (legacy invoice not in system)
ALTER TABLE "SalesReturn" ALTER COLUMN "salesInvoiceId" DROP NOT NULL;

ALTER TABLE "SalesReturn" ADD COLUMN IF NOT EXISTS "isDirectReturn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SalesReturn" ADD COLUMN IF NOT EXISTS "legacyInvoiceNo" TEXT;
ALTER TABLE "SalesReturn" ADD COLUMN IF NOT EXISTS "legacyCustomerName" TEXT;
ALTER TABLE "SalesReturn" ADD COLUMN IF NOT EXISTS "customerType" TEXT;

CREATE INDEX IF NOT EXISTS "SalesReturn_isDirectReturn_idx" ON "SalesReturn"("isDirectReturn");
