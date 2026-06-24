-- Split cash/bank payments on sales invoices
ALTER TABLE "SalesInvoice" ADD COLUMN IF NOT EXISTS "bankAccountId" TEXT;
ALTER TABLE "SalesInvoice" ADD COLUMN IF NOT EXISTS "cashAccountId" TEXT;
ALTER TABLE "SalesInvoice" ADD COLUMN IF NOT EXISTS "bankAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SalesInvoice" ADD COLUMN IF NOT EXISTS "cashAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "SalesInvoice"
  ADD CONSTRAINT "SalesInvoice_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "Account"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SalesInvoice"
  ADD CONSTRAINT "SalesInvoice_cashAccountId_fkey"
  FOREIGN KEY ("cashAccountId") REFERENCES "Account"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
