-- Ensure UUID generation function for data migration
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE "PurchaseImportRequestItem" (
    "id" TEXT NOT NULL,
    "purchaseImportRequestId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "demandQuantity" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseImportRequestItem_pkey" PRIMARY KEY ("id")
);

-- Copy existing item details from PurchaseImportRequest into new child table
INSERT INTO "PurchaseImportRequestItem" (
    "id",
    "purchaseImportRequestId",
    "partId",
    "currentStock",
    "demandQuantity",
    "weight",
    "totalWeight",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    pir."id",
    pir."partId",
    pir."currentStock",
    pir."demandQuantity",
    pir."weight",
    pir."totalWeight",
    pir."createdAt",
    pir."updatedAt"
FROM "PurchaseImportRequest" pir
WHERE pir."partId" IS NOT NULL;

-- Drop old relation/index from header table
DROP INDEX IF EXISTS "PurchaseImportRequest_partId_idx";
ALTER TABLE "PurchaseImportRequest" DROP CONSTRAINT IF EXISTS "PurchaseImportRequest_partId_fkey";

-- Remove item-level columns from header table
ALTER TABLE "PurchaseImportRequest"
    DROP COLUMN IF EXISTS "partId",
    DROP COLUMN IF EXISTS "currentStock",
    DROP COLUMN IF EXISTS "demandQuantity",
    DROP COLUMN IF EXISTS "weight",
    DROP COLUMN IF EXISTS "totalWeight";

-- CreateIndex
CREATE INDEX "PurchaseImportRequestItem_purchaseImportRequestId_idx" ON "PurchaseImportRequestItem"("purchaseImportRequestId");
CREATE INDEX "PurchaseImportRequestItem_partId_idx" ON "PurchaseImportRequestItem"("partId");
CREATE INDEX "PurchaseImportRequestItem_createdAt_idx" ON "PurchaseImportRequestItem"("createdAt");

-- AddForeignKey
ALTER TABLE "PurchaseImportRequestItem"
    ADD CONSTRAINT "PurchaseImportRequestItem_purchaseImportRequestId_fkey"
    FOREIGN KEY ("purchaseImportRequestId") REFERENCES "PurchaseImportRequest"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseImportRequestItem"
    ADD CONSTRAINT "PurchaseImportRequestItem_partId_fkey"
    FOREIGN KEY ("partId") REFERENCES "Part"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
