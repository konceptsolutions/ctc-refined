CREATE TABLE IF NOT EXISTS "KitItem" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "partNo" TEXT NOT NULL,
    "partName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "costPerUnit" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KitItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KitItem_partId_idx" ON "KitItem"("partId");
CREATE INDEX IF NOT EXISTS "KitItem_createdAt_idx" ON "KitItem"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'KitItem_partId_fkey'
  ) THEN
    ALTER TABLE "KitItem"
    ADD CONSTRAINT "KitItem_partId_fkey"
    FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
