-- Add payment term column to sales invoices (idempotent if column was added outside migrations)
ALTER TABLE "SalesInvoice" ADD COLUMN IF NOT EXISTS "term" TEXT;

