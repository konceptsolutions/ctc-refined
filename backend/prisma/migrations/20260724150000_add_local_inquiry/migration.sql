-- CreateTable
CREATE TABLE "LocalInquiry" (
    "id" TEXT NOT NULL,
    "inquiryNo" TEXT NOT NULL,
    "inquiryDate" TIMESTAMP(3) NOT NULL,
    "supplierId" TEXT,
    "remarks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LocalInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalInquiryItem" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LocalInquiryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LocalInquiry_inquiryNo_key" ON "LocalInquiry"("inquiryNo");

-- CreateIndex
CREATE INDEX "LocalInquiry_inquiryDate_idx" ON "LocalInquiry"("inquiryDate");

-- CreateIndex
CREATE INDEX "LocalInquiry_supplierId_idx" ON "LocalInquiry"("supplierId");

-- CreateIndex
CREATE INDEX "LocalInquiryItem_inquiryId_idx" ON "LocalInquiryItem"("inquiryId");

-- CreateIndex
CREATE INDEX "LocalInquiryItem_partId_idx" ON "LocalInquiryItem"("partId");

-- AddForeignKey
ALTER TABLE "LocalInquiry" ADD CONSTRAINT "LocalInquiry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalInquiryItem" ADD CONSTRAINT "LocalInquiryItem_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "LocalInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalInquiryItem" ADD CONSTRAINT "LocalInquiryItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;
