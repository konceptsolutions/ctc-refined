ALTER TABLE "EmployeeTransaction"
ADD COLUMN IF NOT EXISTS "payrollMonth" TEXT;

CREATE INDEX IF NOT EXISTS "EmployeeTransaction_employeeId_payrollMonth_idx"
ON "EmployeeTransaction"("employeeId", "payrollMonth");
