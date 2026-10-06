const { PrismaClient } = require('../node_modules/.prisma/client');
const p = new PrismaClient();
(async () => {
  const rows = await p.$queryRawUnsafe(`
    SELECT poi.quantity, poi."receivedQty", poi."fcRate", poi."additionalQty", poi."backQty",
           po."poNumber", po.status, po."updatedAt"
    FROM "PurchaseOrderItem" poi
    JOIN "PurchaseOrder" po ON po.id = poi."purchaseOrderId"
    WHERE po."purchaseQuotationId" IS NOT NULL
    ORDER BY po."updatedAt" DESC
    LIMIT 20
  `);
  console.log(JSON.stringify(rows, null, 2));
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await p.$disconnect(); } catch (_) {}
  process.exit(1);
});
