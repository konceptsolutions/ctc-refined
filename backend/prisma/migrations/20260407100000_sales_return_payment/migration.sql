ALTER TABLE "SalesReturn" ADD COLUMN IF NOT EXISTS "paymentAccountId" TEXT;
ALTER TABLE "SalesReturn" ADD COLUMN IF NOT EXISTS "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "SalesReturn" DROP CONSTRAINT IF EXISTS "SalesReturn_paymentAccountId_fkey";
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_paymentAccountId_fkey"
  FOREIGN KEY ("paymentAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
