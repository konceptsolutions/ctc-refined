CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnic" TEXT,
    "contactNo" TEXT,
    "email" TEXT,
    "address" TEXT,
    "designation" TEXT,
    "department" TEXT,
    "joiningDate" TIMESTAMP(3),
    "monthlySalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "remarks" TEXT,
    "openingLoanBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingAdvanceBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingSalaryPayable" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeTransaction" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "loanRecovery" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "advanceRecovery" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT,
    "voucherId" TEXT,
    "referenceNo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Employee_code_key" ON "Employee"("code");
CREATE INDEX "Employee_status_idx" ON "Employee"("status");
CREATE INDEX "Employee_name_idx" ON "Employee"("name");
CREATE INDEX "EmployeeTransaction_employeeId_idx" ON "EmployeeTransaction"("employeeId");
CREATE INDEX "EmployeeTransaction_date_idx" ON "EmployeeTransaction"("date");
CREATE INDEX "EmployeeTransaction_type_idx" ON "EmployeeTransaction"("type");

ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "employeeAccountRole" TEXT;
ALTER TABLE "VoucherEntry" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;

ALTER TABLE "Account"
ADD CONSTRAINT "Account_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VoucherEntry"
ADD CONSTRAINT "VoucherEntry_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeTransaction"
ADD CONSTRAINT "EmployeeTransaction_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeTransaction"
ADD CONSTRAINT "EmployeeTransaction_voucherId_fkey"
FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
