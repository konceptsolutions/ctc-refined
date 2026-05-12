-- Normalize SalesInvoice.invoiceNo: strip INV-YYYY- and INV- prefixes (digits only).
-- Uses a temp value phase so @unique on invoiceNo is not violated mid-migration.

CREATE TEMP TABLE _invoice_no_migrate (
  id TEXT PRIMARY KEY,
  new_no TEXT NOT NULL
);

INSERT INTO _invoice_no_migrate (id, new_no)
SELECT
  s.id,
  CASE
    WHEN s."invoiceNo" ~ '^INV-\d{4}-\d+$' THEN regexp_replace(s."invoiceNo", '^INV-\d{4}-', '')
    WHEN s."invoiceNo" ~ '^INV-' THEN regexp_replace(s."invoiceNo", '^INV-', '')
    ELSE s."invoiceNo"
  END
FROM "SalesInvoice" s
WHERE s."invoiceNo" ~ '^INV-';

-- No duplicate targets among rows being migrated
DO $$
DECLARE r TEXT;
BEGIN
  SELECT m.new_no INTO r
  FROM _invoice_no_migrate m
  GROUP BY m.new_no
  HAVING COUNT(*) > 1
  LIMIT 1;
  IF r IS NOT NULL THEN
    RAISE EXCEPTION 'normalize_sales_invoice_no: duplicate target invoice number % after stripping INV prefix (multiple rows would become the same number)', r;
  END IF;
END $$;

-- Target must not already be used by another invoice (numeric or other) outside this migrate set
DO $$
DECLARE r TEXT;
BEGIN
  SELECT m.new_no INTO r
  FROM _invoice_no_migrate m
  INNER JOIN "SalesInvoice" s ON s."invoiceNo" = m.new_no AND s.id <> m.id
  LIMIT 1;
  IF r IS NOT NULL THEN
    RAISE EXCEPTION 'normalize_sales_invoice_no: target invoice number % already exists on another row', r;
  END IF;
END $$;

-- Phase 1: unique placeholders
UPDATE "SalesInvoice" s
SET "invoiceNo" = '__migr_inv__' || replace(s.id::text, '-', '')
FROM _invoice_no_migrate m
WHERE s.id = m.id;

-- Phase 2: final numeric (or preserved suffix) values
UPDATE "SalesInvoice" s
SET "invoiceNo" = m.new_no
FROM _invoice_no_migrate m
WHERE s.id = m.id;

DROP TABLE _invoice_no_migrate;
