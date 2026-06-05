-- Transfer In: branch account + order type on direct purchase orders
ALTER TABLE "DirectPurchaseOrder" ADD COLUMN IF NOT EXISTS "branchAccountId" TEXT;
ALTER TABLE "DirectPurchaseOrder" ADD COLUMN IF NOT EXISTS "orderType" TEXT NOT NULL DEFAULT 'local_purchase';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DirectPurchaseOrder_branchAccountId_fkey'
  ) THEN
    ALTER TABLE "DirectPurchaseOrder"
      ADD CONSTRAINT "DirectPurchaseOrder_branchAccountId_fkey"
      FOREIGN KEY ("branchAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
