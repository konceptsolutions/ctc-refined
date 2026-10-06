const { PrismaClient } = require('../node_modules/.prisma/client');
const p = new PrismaClient();
(async () => {
  const mismatched = await p.$queryRawUnsafe(`
    SELECT po."poNumber", po.status, poi.quantity, poi."receivedQty", poi."additionalQty", poi."backQty", poi."fcRate"
    FROM "PurchaseOrderItem" poi
    JOIN "PurchaseOrder" po ON po.id = poi."purchaseOrderId"
    WHERE po."purchaseQuotationId" IS NOT NULL
      AND poi."receivedQty" <> poi.quantity
    ORDER BY po."updatedAt" DESC
    LIMIT 30
  `);
  console.log('mismatched', JSON.stringify(mismatched, null, 2));

  const recent = await p.$queryRawUnsafe(`
    SELECT po."poNumber", po.status, po."updatedAt",
           COUNT(*)::int as lines,
           SUM(CASE WHEN poi."receivedQty" = poi.quantity THEN 1 ELSE 0 END)::int as same_as_order,
           SUM(CASE WHEN poi."receivedQty" <> poi.quantity THEN 1 ELSE 0 END)::int as different
    FROM "PurchaseOrder" po
    JOIN "PurchaseOrderItem" poi ON poi."purchaseOrderId" = po.id
    WHERE po."purchaseQuotationId" IS NOT NULL
    GROUP BY po.id
    ORDER BY po."updatedAt" DESC
    LIMIT 10
  `);
  console.log('recent summary', JSON.stringify(recent, null, 2));
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await p.$disconnect(); } catch (_) {}
  process.exit(1);
});
