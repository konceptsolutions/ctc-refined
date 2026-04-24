ALTER TABLE "PurchaseImportRequest"
ADD COLUMN "requestNo" TEXT;

WITH batch_sequence AS (
  SELECT
    pir."batchId",
    ROW_NUMBER() OVER (ORDER BY MIN(pir."createdAt"), pir."batchId") AS batch_no
  FROM "PurchaseImportRequest" pir
  GROUP BY pir."batchId"
),
request_sequence AS (
  SELECT
    pir."id",
    bs.batch_no,
    ROW_NUMBER() OVER (
      PARTITION BY pir."batchId"
      ORDER BY pir."createdAt", pir."id"
    ) AS supplier_no,
    COUNT(*) OVER (PARTITION BY pir."batchId") AS supplier_count
  FROM "PurchaseImportRequest" pir
  JOIN batch_sequence bs ON bs."batchId" = pir."batchId"
)
UPDATE "PurchaseImportRequest" pir
SET "requestNo" = CASE
  WHEN rs.supplier_count > 1
    THEN 'PIR-' || LPAD(rs.batch_no::TEXT, 4, '0') || '-' || rs.supplier_no::TEXT
  ELSE
    'PIR-' || LPAD(rs.batch_no::TEXT, 4, '0')
END
FROM request_sequence rs
WHERE pir."id" = rs."id";

ALTER TABLE "PurchaseImportRequest"
ALTER COLUMN "requestNo" SET NOT NULL;

CREATE UNIQUE INDEX "PurchaseImportRequest_requestNo_key" ON "PurchaseImportRequest"("requestNo");
