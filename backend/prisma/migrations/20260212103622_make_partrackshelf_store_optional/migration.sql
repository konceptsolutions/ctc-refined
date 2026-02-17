/*
  Warnings:

  - You are about to drop the column `deletedAt` on the `SalesInvoice` table. All the data in the column will be lost.
  - You are about to drop the column `customerId` on the `StockMovement` table. All the data in the column will be lost.
  - You are about to drop the column `supplierId` on the `StockMovement` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_customerId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_supplierId_fkey";

-- AlterTable
ALTER TABLE "SalesInvoice" DROP COLUMN "deletedAt";

-- AlterTable
ALTER TABLE "StockMovement" DROP COLUMN "customerId",
DROP COLUMN "supplierId";

-- CreateTable
CREATE TABLE "PartRackShelf" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "storeId" TEXT,
    "rackId" TEXT,
    "shelfId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartRackShelf_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartRackShelf_partId_storeId_rackId_shelfId_key" ON "PartRackShelf"("partId", "storeId", "rackId", "shelfId");

-- AddForeignKey
ALTER TABLE "PartRackShelf" ADD CONSTRAINT "PartRackShelf_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartRackShelf" ADD CONSTRAINT "PartRackShelf_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartRackShelf" ADD CONSTRAINT "PartRackShelf_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "Rack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartRackShelf" ADD CONSTRAINT "PartRackShelf_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "Shelf"("id") ON DELETE SET NULL ON UPDATE CASCADE;
