-- Persist last confirmation qty/splits on quotation items so unconfirm
-- can delete POs without forcing the user to re-enter confirm data.
ALTER TABLE "PurchaseQuotationItem"
ADD COLUMN IF NOT EXISTS "confirmQuantity" INTEGER,
ADD COLUMN IF NOT EXISTS "confirmKhiQuantity" INTEGER,
ADD COLUMN IF NOT EXISTS "confirmIsbQuantity" INTEGER,
ADD COLUMN IF NOT EXISTS "confirmOtherQuantity" INTEGER;
