const { PrismaClient } = require('../node_modules/.prisma/client');
const p = new PrismaClient();
(async () => {
  const pos = await p.purchaseOrder.findMany({
    where: { poNumber: { in: ['PO-2609-008', 'PO-2609-007'] } },
    select: {
      poNumber: true,
      status: true,
      date: true,
      expectedDate: true,
      invoiceDate: true,
      blDate: true,
    },
  });
  console.log('headers', JSON.stringify(pos, null, 2));

  for (const po of pos) {
    const items = await p.purchaseOrderItem.findMany({
      where: {
        purchaseOrderId: undefined,
        PurchaseOrder: { poNumber: po.poNumber },
        Part: { partNo: '4N1828' },
      },
      select: {
        quantity: true,
        receivedQty: true,
        Part: { select: { partNo: true, brand: true } },
      },
    });
    // fix query - use po id from headers
  }

  const detailed = await p.purchaseOrderItem.findMany({
    where: {
      Part: { partNo: '4N1828' },
      PurchaseOrder: { poNumber: { in: ['PO-2609-008', 'PO-2609-007'] } },
    },
    select: {
      quantity: true,
      receivedQty: true,
      PurchaseOrder: {
        select: { poNumber: true, status: true, expectedDate: true, date: true },
      },
      Part: { select: { partNo: true } },
    },
  });
  console.log('4N1828 lines', JSON.stringify(detailed, null, 2));
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await p.$disconnect(); } catch (_) {}
  process.exit(1);
});
