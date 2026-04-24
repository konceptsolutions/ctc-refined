CREATE TABLE "PurchaseQuotation" (
    "id" TEXT NOT NULL,
    "quotationNo" TEXT NOT NULL,
    "purchaseImportRequestId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "conversionRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "fcTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lcTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fcRevisedTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lcRevisedTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quotationDate" TIMESTAMP(3) NOT NULL,
    "revisedQuotationDate" TIMESTAMP(3),
    "quotationType" TEXT NOT NULL DEFAULT 'original',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseQuotation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseQuotationItem" (
    "id" TEXT NOT NULL,
    "purchaseQuotationId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "demandQuantity" INTEGER NOT NULL,
    "quotationQuantity" INTEGER NOT NULL,
    "shipDays" INTEGER NOT NULL DEFAULT 0,
    "fcRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fcAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lcRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lcAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revisedFcRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revisedFcAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revisedLcRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revisedLcAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseQuotationItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PurchaseQuotation_quotationNo_key" ON "PurchaseQuotation"("quotationNo");
CREATE INDEX "PurchaseQuotation_purchaseImportRequestId_idx" ON "PurchaseQuotation"("purchaseImportRequestId");
CREATE INDEX "PurchaseQuotation_supplierId_idx" ON "PurchaseQuotation"("supplierId");
CREATE INDEX "PurchaseQuotation_quotationDate_idx" ON "PurchaseQuotation"("quotationDate");
CREATE INDEX "PurchaseQuotation_createdAt_idx" ON "PurchaseQuotation"("createdAt");
CREATE INDEX "PurchaseQuotationItem_purchaseQuotationId_idx" ON "PurchaseQuotationItem"("purchaseQuotationId");
CREATE INDEX "PurchaseQuotationItem_partId_idx" ON "PurchaseQuotationItem"("partId");
CREATE INDEX "PurchaseQuotationItem_createdAt_idx" ON "PurchaseQuotationItem"("createdAt");

ALTER TABLE "PurchaseQuotation"
ADD CONSTRAINT "PurchaseQuotation_purchaseImportRequestId_fkey"
FOREIGN KEY ("purchaseImportRequestId") REFERENCES "PurchaseImportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseQuotation"
ADD CONSTRAINT "PurchaseQuotation_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseQuotationItem"
ADD CONSTRAINT "PurchaseQuotationItem_purchaseQuotationId_fkey"
FOREIGN KEY ("purchaseQuotationId") REFERENCES "PurchaseQuotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseQuotationItem"
ADD CONSTRAINT "PurchaseQuotationItem_partId_fkey"
FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;
