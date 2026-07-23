-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "transferOutInvoiceId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseOrder_transferOutInvoiceId_idx" ON "PurchaseOrder"("transferOutInvoiceId");
