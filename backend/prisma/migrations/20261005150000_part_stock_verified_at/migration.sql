-- AlterTable
ALTER TABLE "Part" ADD COLUMN IF NOT EXISTS "stockVerifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Part_stockVerifiedAt_idx" ON "Part"("stockVerifiedAt");
