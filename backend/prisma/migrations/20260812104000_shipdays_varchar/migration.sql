ALTER TABLE "PurchaseQuotationItem"
ALTER COLUMN "shipDays" TYPE VARCHAR(50) USING "shipDays"::text,
ALTER COLUMN "shipDays" SET DEFAULT 'STK';
