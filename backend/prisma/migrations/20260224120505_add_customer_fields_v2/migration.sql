/*
  Warnings:

  - You are about to drop the `JournalEntry` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `JournalLine` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[code]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[partId,storeId,rackId,shelfId]` on the table `PartRackShelf` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "JournalLine" DROP CONSTRAINT "JournalLine_accountId_fkey";

-- DropForeignKey
ALTER TABLE "JournalLine" DROP CONSTRAINT "JournalLine_journalEntryId_fkey";

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "accountClosingDate" TIMESTAMP(3),
ADD COLUMN     "accountHead" TEXT,
ADD COLUMN     "accountOpeningDate" TIMESTAMP(3),
ADD COLUMN     "area" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "cellNumber" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "contactPersons" JSONB DEFAULT '[]',
ADD COLUMN     "gstNumber" TEXT,
ADD COLUMN     "ntn" TEXT,
ADD COLUMN     "pstNumber" TEXT,
ADD COLUMN     "referenceName" TEXT,
ADD COLUMN     "remarks" TEXT,
ADD COLUMN     "shortTitle" TEXT,
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "DirectPurchaseOrderReturn" ADD COLUMN     "deduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SalesInvoiceItem" ADD COLUMN     "avgCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "useUnlocatedStock" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SalesReturnItem" ADD COLUMN     "avgCost" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "supplierId" TEXT;

-- AlterTable
ALTER TABLE "StockReservation" ADD COLUMN     "rackId" TEXT,
ADD COLUMN     "shelfId" TEXT,
ADD COLUMN     "storeId" TEXT,
ADD COLUMN     "useUnlocatedStock" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "accountHead" TEXT,
ADD COLUMN     "area" TEXT,
ADD COLUMN     "cellNumber" TEXT,
ADD COLUMN     "contactPersons" JSONB DEFAULT '[]',
ADD COLUMN     "gstNumber" TEXT,
ADD COLUMN     "ntn" TEXT,
ADD COLUMN     "referenceName" TEXT,
ADD COLUMN     "remarks" TEXT,
ADD COLUMN     "shortTitle" TEXT,
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "Voucher" ADD COLUMN     "salesInvoiceId" TEXT;

-- AlterTable
ALTER TABLE "VoucherEntry" ADD COLUMN     "salesInvoiceId" TEXT;

-- DropTable
DROP TABLE "JournalEntry";

-- DropTable
DROP TABLE "JournalLine";

-- CreateTable
CREATE TABLE "InvoiceRackShelf" (
    "id" TEXT NOT NULL,
    "salesInvoiceItemId" TEXT NOT NULL,
    "storeId" TEXT,
    "rackId" TEXT,
    "shelfId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceRackShelf_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PartRackShelf_partId_storeId_rackId_shelfId_key" ON "PartRackShelf"("partId", "storeId", "rackId", "shelfId");

-- AddForeignKey
ALTER TABLE "InvoiceRackShelf" ADD CONSTRAINT "InvoiceRackShelf_salesInvoiceItemId_fkey" FOREIGN KEY ("salesInvoiceItemId") REFERENCES "SalesInvoiceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRackShelf" ADD CONSTRAINT "InvoiceRackShelf_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRackShelf" ADD CONSTRAINT "InvoiceRackShelf_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "Rack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRackShelf" ADD CONSTRAINT "InvoiceRackShelf_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "Shelf"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "Rack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "Shelf"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherEntry" ADD CONSTRAINT "VoucherEntry_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
