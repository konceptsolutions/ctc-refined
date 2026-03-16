/**
 * Reverse all sales invoices and their impact:
 * - Restore stock: reverse StockMovement (out -> add back to PartRackShelf, in/reverse -> subtract)
 * - Delete StockMovement linked to invoices (sales_invoice, sales_invoice_reverse)
 * - Delete StockReservation for each invoice
 * - Delete InvoiceRackShelf (location allocations for invoice items)
 * - Unlink Adjustment from vouchers, then delete Vouchers and VoucherEntry
 * - Delete Receivable, DeliveryLog (and items), SalesInvoiceItem, SalesInvoice
 *
 * Run from backend: npx tsx src/scripts/reverse_all_invoices.ts
 */
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const prisma = new PrismaClient();

async function main() {
  const invoices = await prisma.salesInvoice.findMany({
    select: { id: true, invoiceNo: true },
    orderBy: { invoiceNo: "asc" },
  });

  console.log(`Found ${invoices.length} invoice(s) to reverse.`);

  for (const inv of invoices) {
    await prisma.$transaction(async (tx) => {
      const id = inv.id;

      // 1. StockMovement: restore PartRackShelf then delete movements
      const movements = await tx.stockMovement.findMany({
        where: {
          OR: [
            { referenceType: "sales_invoice", referenceId: id },
            { referenceType: "sales_invoice_reverse", referenceId: id },
          ],
        },
      });

      for (const m of movements) {
        const isOut = m.type === "out";
        const qty = m.quantity;
        const partId = m.partId;
        const storeId = m.storeId ?? null;
        const rackId = m.rackId ?? null;
        const shelfId = m.shelfId ?? null;

        const prs = await tx.partRackShelf.findFirst({
          where: {
            partId,
            storeId,
            rackId,
            shelfId,
          },
        });

        if (isOut) {
          // Out movement had reduced PartRackShelf → add back
          if (prs) {
            await tx.partRackShelf.update({
              where: { id: prs.id },
              data: { quantity: { increment: qty } },
            });
          } else {
            await tx.partRackShelf.create({
              data: {
                partId,
                storeId,
                rackId,
                shelfId,
                quantity: qty,
              },
            });
          }
        } else {
          // In movement (e.g. sales_invoice_reverse) had increased PartRackShelf → subtract
          if (prs) {
            const newQty = Math.max(0, prs.quantity - qty);
            await tx.partRackShelf.update({
              where: { id: prs.id },
              data: { quantity: newQty },
            });
          }
        }
      }

      await tx.stockMovement.deleteMany({
        where: {
          OR: [
            { referenceType: "sales_invoice", referenceId: id },
            { referenceType: "sales_invoice_reverse", referenceId: id },
          ],
        },
      });

      // 2. StockReservation
      await tx.stockReservation.deleteMany({ where: { invoiceId: id } });

      // 3. InvoiceRackShelf (via invoice item ids)
      const itemIds = await tx.salesInvoiceItem
        .findMany({ where: { invoiceId: id }, select: { id: true } })
        .then((rows) => rows.map((r) => r.id));

      if (itemIds.length > 0) {
        await tx.invoiceRackShelf.deleteMany({
          where: { salesInvoiceItemId: { in: itemIds } },
        });
      }

      // 4. Unlink Adjustment from vouchers linked to this invoice, then delete vouchers
      const vouchers = await tx.voucher.findMany({
        where: { salesInvoiceId: id },
        select: { id: true },
      });
      const voucherIds = vouchers.map((v) => v.id);
      if (voucherIds.length > 0) {
        await tx.adjustment.updateMany({
          where: { voucherId: { in: voucherIds } },
          data: { voucherId: null },
        });
        await tx.voucher.deleteMany({ where: { salesInvoiceId: id } });
      }

      // 5. Unlink SalesQuotation from this invoice, then delete invoice (cascades: Receivable, DeliveryLog+items, SalesReturn+items, SalesInvoiceItem)
      await tx.salesQuotation.updateMany({
        where: { invoiceId: id },
        data: { invoiceId: null },
      });
      await tx.salesInvoice.delete({ where: { id } });
      console.log(`Reversed invoice ${inv.invoiceNo} (${id}).`);
    });
  }

  console.log(`Done. Reversed ${invoices.length} invoice(s) and all related vouchers, stock movements, PartRackShelf impact, InvoiceRackShelf, StockReservation, Receivable, and DeliveryLog.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
