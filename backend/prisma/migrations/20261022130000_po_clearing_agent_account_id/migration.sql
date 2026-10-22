-- AlterTable: link import PO clearance JV to Clearing Agents chart account
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "clearingAgentAccountId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseOrder_clearingAgentAccountId_idx"
  ON "PurchaseOrder"("clearingAgentAccountId");

-- AddForeignKey (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PurchaseOrder_clearingAgentAccountId_fkey'
  ) THEN
    ALTER TABLE "PurchaseOrder"
      ADD CONSTRAINT "PurchaseOrder_clearingAgentAccountId_fkey"
      FOREIGN KEY ("clearingAgentAccountId") REFERENCES "Account"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
