-- Performance indexes for parts list / stock lookups (idempotent)
CREATE INDEX IF NOT EXISTS "AdjustmentItem_partId_idx" ON "AdjustmentItem"("partId");
CREATE INDEX IF NOT EXISTS "AdjustmentItem_adjustmentId_idx" ON "AdjustmentItem"("adjustmentId");

CREATE INDEX IF NOT EXISTS "DirectPurchaseOrderItem_partId_idx" ON "DirectPurchaseOrderItem"("partId");
CREATE INDEX IF NOT EXISTS "DirectPurchaseOrderItem_directPurchaseOrderId_idx" ON "DirectPurchaseOrderItem"("directPurchaseOrderId");

CREATE INDEX IF NOT EXISTS "Part_updatedAt_idx" ON "Part"("updatedAt");
CREATE INDEX IF NOT EXISTS "Part_status_updatedAt_idx" ON "Part"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "Part_partNo_idx" ON "Part"("partNo");
CREATE INDEX IF NOT EXISTS "Part_masterPartId_idx" ON "Part"("masterPartId");
CREATE INDEX IF NOT EXISTS "Part_brandId_idx" ON "Part"("brandId");
CREATE INDEX IF NOT EXISTS "Part_categoryId_idx" ON "Part"("categoryId");

CREATE INDEX IF NOT EXISTS "SalesInvoiceItem_partId_idx" ON "SalesInvoiceItem"("partId");
CREATE INDEX IF NOT EXISTS "SalesInvoiceItem_invoiceId_idx" ON "SalesInvoiceItem"("invoiceId");

CREATE INDEX IF NOT EXISTS "StockMovement_partId_idx" ON "StockMovement"("partId");
CREATE INDEX IF NOT EXISTS "StockMovement_partId_referenceType_idx" ON "StockMovement"("partId", "referenceType");
CREATE INDEX IF NOT EXISTS "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

CREATE INDEX IF NOT EXISTS "StockReservation_partId_idx" ON "StockReservation"("partId");
CREATE INDEX IF NOT EXISTS "StockReservation_partId_status_idx" ON "StockReservation"("partId", "status");
CREATE INDEX IF NOT EXISTS "StockReservation_status_idx" ON "StockReservation"("status");
