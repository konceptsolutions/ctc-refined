ALTER TABLE "EmployeeTransaction" ADD COLUMN IF NOT EXISTS "extraPayment" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "EmployeeTransaction" ADD COLUMN IF NOT EXISTS "extraPaymentDescription" TEXT;
ALTER TABLE "EmployeeTransaction" ADD COLUMN IF NOT EXISTS "extraDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "EmployeeTransaction" ADD COLUMN IF NOT EXISTS "extraDeductionDescription" TEXT;
