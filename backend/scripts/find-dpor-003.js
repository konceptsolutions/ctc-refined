const { PrismaClient } = require('../node_modules/.prisma/client');
const p = new PrismaClient();

(async () => {
  const moves = await p.stockMovement.findMany({
    where: { referenceType: 'dpo_return' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      partId: true,
      quantity: true,
      referenceId: true,
      notes: true,
      createdAt: true,
      supplierId: true,
    },
  });
  console.log('dpo_return movements', moves);

  const dpo080 = await p.directPurchaseOrder.findMany({
    where: {
      OR: [
        { dpoNumber: { contains: '080' } },
        { dpoNumber: { endsWith: '-080' } },
      ],
    },
    include: {
      Supplier: true,
      DirectPurchaseOrderItem: { include: { Part: true } },
    },
  });
  console.log(
    'dpo080',
    dpo080.map((d) => ({
      id: d.id,
      dpoNumber: d.dpoNumber,
      supplier: d.Supplier?.name || d.Supplier?.companyName,
      supplierId: d.supplierId,
      status: d.status,
      totalAmount: d.totalAmount,
      items: d.DirectPurchaseOrderItem.map((i) => ({
        partNo: i.Part?.partNo,
        qty: i.quantity,
        price: i.purchasePrice,
        amount: i.quantity * i.purchasePrice,
      })),
    })),
  );

  const aliReturns = await p.$queryRawUnsafe(`
    SELECT r.*
    FROM "DirectPurchaseOrderReturn" r
    WHERE r."supplierId" = '08e1fb60-a4dd-48dc-97fd-8b66034e5090'
       OR r."returnNumber" ILIKE '%003%'
    ORDER BY r."createdAt" DESC
  `);
  console.log('ali/003 returns', aliReturns);

  const recentV = await p.voucher.findMany({
    where: { createdAt: { gte: new Date('2026-10-01') } },
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: { voucherNumber: true, type: true, narration: true, totalDebit: true, createdAt: true },
  });
  console.log('today vouchers', recentV);

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await p.$disconnect(); } catch (_) {}
  process.exit(1);
});
