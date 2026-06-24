-- Allow multiple purchase orders per quotation and store consignee lane
ALTER TABLE "PurchaseQuotation" ADD COLUMN "confirmationDate" TIMESTAMP(3);

DROP INDEX IF EXISTS "PurchaseOrder_purchaseQuotationId_key";

ALTER TABLE "PurchaseOrder" ADD COLUMN "consignee" TEXT;

CREATE INDEX "PurchaseOrder_purchaseQuotationId_idx" ON "PurchaseOrder"("purchaseQuotationId");
