-- CreateTable
CREATE TABLE "PurchaseImportRequest" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "demandQuantity" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseImportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseImportRequest_batchId_idx" ON "PurchaseImportRequest"("batchId");

-- CreateIndex
CREATE INDEX "PurchaseImportRequest_supplierId_idx" ON "PurchaseImportRequest"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseImportRequest_partId_idx" ON "PurchaseImportRequest"("partId");

-- CreateIndex
CREATE INDEX "PurchaseImportRequest_createdAt_idx" ON "PurchaseImportRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "PurchaseImportRequest" ADD CONSTRAINT "PurchaseImportRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseImportRequest" ADD CONSTRAINT "PurchaseImportRequest_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;
