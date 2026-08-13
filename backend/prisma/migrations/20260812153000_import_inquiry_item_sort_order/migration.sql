-- Preserve import inquiry / quotation / PO line sequence independently of UUID / createdAt ties.

ALTER TABLE "PurchaseImportRequestItem" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseQuotationItem" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Best-effort backfill (identical createdAt still falls back to id).
WITH ranked AS (
  SELECT
    id,
    (ROW_NUMBER() OVER (
      PARTITION BY "purchaseImportRequestId"
      ORDER BY "createdAt" ASC, id ASC
    ) - 1) AS rn
  FROM "PurchaseImportRequestItem"
)
UPDATE "PurchaseImportRequestItem" AS pir
SET "sortOrder" = ranked.rn
FROM ranked
WHERE pir.id = ranked.id;

WITH ranked AS (
  SELECT
    id,
    (ROW_NUMBER() OVER (
      PARTITION BY "purchaseQuotationId"
      ORDER BY "createdAt" ASC, id ASC
    ) - 1) AS rn
  FROM "PurchaseQuotationItem"
)
UPDATE "PurchaseQuotationItem" AS pqi
SET "sortOrder" = ranked.rn
FROM ranked
WHERE pqi.id = ranked.id;

WITH ranked AS (
  SELECT
    id,
    (ROW_NUMBER() OVER (
      PARTITION BY "purchaseOrderId"
      ORDER BY "createdAt" ASC, id ASC
    ) - 1) AS rn
  FROM "PurchaseOrderItem"
)
UPDATE "PurchaseOrderItem" AS poi
SET "sortOrder" = ranked.rn
FROM ranked
WHERE poi.id = ranked.id;

CREATE INDEX IF NOT EXISTS "PurchaseImportRequestItem_purchaseImportRequestId_sortOrder_idx"
  ON "PurchaseImportRequestItem"("purchaseImportRequestId", "sortOrder");

CREATE INDEX IF NOT EXISTS "PurchaseQuotationItem_purchaseQuotationId_sortOrder_idx"
  ON "PurchaseQuotationItem"("purchaseQuotationId", "sortOrder");

CREATE INDEX IF NOT EXISTS "PurchaseOrderItem_purchaseOrderId_sortOrder_idx"
  ON "PurchaseOrderItem"("purchaseOrderId", "sortOrder");
