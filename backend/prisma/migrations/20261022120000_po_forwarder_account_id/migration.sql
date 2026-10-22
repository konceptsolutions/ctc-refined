-- AlterTable: link import PO forwarder to chart account (Import F.R.T clearence)
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "forwarderAccountId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseOrder_forwarderAccountId_idx"
  ON "PurchaseOrder"("forwarderAccountId");

-- AddForeignKey (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PurchaseOrder_forwarderAccountId_fkey'
  ) THEN
    ALTER TABLE "PurchaseOrder"
      ADD CONSTRAINT "PurchaseOrder_forwarderAccountId_fkey"
      FOREIGN KEY ("forwarderAccountId") REFERENCES "Account"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
