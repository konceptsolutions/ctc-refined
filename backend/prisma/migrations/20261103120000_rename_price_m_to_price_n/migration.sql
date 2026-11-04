-- Rename Price M → Price N on all tables that store it.
ALTER TABLE "AdjustmentItem" RENAME COLUMN "priceM" TO "priceN";
ALTER TABLE "DirectPurchaseOrderItem" RENAME COLUMN "priceM" TO "priceN";
ALTER TABLE "Part" RENAME COLUMN "priceM" TO "priceN";
ALTER TABLE "SalesInquiryItem" RENAME COLUMN "priceM" TO "priceN";

-- Customer default price type letter M → N
UPDATE "Customer" SET "priceType" = 'N' WHERE "priceType" = 'M';

-- Price history field name (if stored as priceM / price_m)
UPDATE "PriceHistory" SET "priceField" = 'priceN' WHERE "priceField" IN ('priceM', 'price_m');
