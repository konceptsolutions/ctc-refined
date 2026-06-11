import prisma from '../config/database';

/**
 * Set sale invoice status from completed returns vs delivered qty per part.
 * DB status: `return` (all delivered qty returned) or `partially_return` (some only).
 */
export async function syncSalesInvoiceReturnStatus(
  salesInvoiceId: string,
): Promise<'return' | 'partially_return' | null> {
  const invoice = await prisma.salesInvoice.findUnique({
    where: { id: salesInvoiceId },
    include: {
      SalesInvoiceItem: true,
      SalesReturn: {
        where: { status: 'completed' },
        include: { SalesReturnItem: true },
      },
    },
  });

  if (!invoice || invoice.status === 'cancelled') return null;

  const deliveredByPart = new Map<string, number>();
  for (const item of invoice.SalesInvoiceItem) {
    deliveredByPart.set(
      item.partId,
      (deliveredByPart.get(item.partId) || 0) + Number(item.deliveredQty || 0),
    );
  }

  const returnedByPart = new Map<string, number>();
  for (const salesReturn of invoice.SalesReturn) {
    for (const item of salesReturn.SalesReturnItem) {
      returnedByPart.set(
        item.partId,
        (returnedByPart.get(item.partId) || 0) + Number(item.returnQuantity || 0),
      );
    }
  }

  let anyReturned = false;
  let allFullyReturned = true;
  let hasDelivered = false;

  for (const [partId, delivered] of deliveredByPart) {
    if (delivered <= 0) continue;
    hasDelivered = true;
    const returned = returnedByPart.get(partId) || 0;
    if (returned > 0) anyReturned = true;
    if (returned < delivered) allFullyReturned = false;
  }

  if (!hasDelivered || !anyReturned) return null;

  const newStatus = allFullyReturned ? 'return' : 'partially_return';

  await prisma.salesInvoice.update({
    where: { id: salesInvoiceId },
    data: {
      status: newStatus,
      updatedAt: new Date(),
    },
  });

  return newStatus;
}
