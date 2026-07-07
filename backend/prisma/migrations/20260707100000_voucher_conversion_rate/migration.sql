-- Add conversionRate to Voucher (used to record PO exchange rate for import supplier vouchers)
ALTER TABLE "Voucher" ADD COLUMN IF NOT EXISTS "conversionRate" DOUBLE PRECISION;
