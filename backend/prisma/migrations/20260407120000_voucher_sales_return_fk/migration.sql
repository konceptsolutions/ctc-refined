ALTER TABLE "Voucher" ADD COLUMN IF NOT EXISTS "salesReturnId" TEXT;

CREATE INDEX IF NOT EXISTS "Voucher_salesReturnId_idx" ON "Voucher"("salesReturnId");

ALTER TABLE "Voucher" DROP CONSTRAINT IF EXISTS "Voucher_salesReturnId_fkey";
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_salesReturnId_fkey"
  FOREIGN KEY ("salesReturnId") REFERENCES "SalesReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
