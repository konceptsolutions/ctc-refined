-- Link import purchase orders to confirmed purchase quotations (one PO per quotation)
ALTER TABLE "PurchaseOrder" ADD COLUMN "purchaseQuotationId" TEXT;

CREATE UNIQUE INDEX "PurchaseOrder_purchaseQuotationId_key" ON "PurchaseOrder"("purchaseQuotationId");

ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_purchaseQuotationId_fkey" FOREIGN KEY ("purchaseQuotationId") REFERENCES "PurchaseQuotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
