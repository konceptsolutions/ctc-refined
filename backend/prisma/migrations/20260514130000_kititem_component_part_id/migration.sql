-- Store the exact single-type Part row for each kit line (same partNo can exist under multiple brands).
ALTER TABLE "KitItem" ADD COLUMN IF NOT EXISTS "componentPartId" TEXT;

CREATE INDEX IF NOT EXISTS "KitItem_componentPartId_idx" ON "KitItem"("componentPartId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'KitItem_componentPartId_fkey'
  ) THEN
    ALTER TABLE "KitItem"
      ADD CONSTRAINT "KitItem_componentPartId_fkey"
      FOREIGN KEY ("componentPartId") REFERENCES "Part"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
