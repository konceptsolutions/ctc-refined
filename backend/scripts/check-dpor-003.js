const { PrismaClient } = require('../node_modules/.prisma/client');
const p = new PrismaClient();

(async () => {
  const r = await p.directPurchaseOrderReturn.findFirst({
    where: { returnNumber: 'DPOR-2026-003' },
    include: {
      DirectPurchaseOrderReturnItem: { include: { Part: true } },
      DirectPurchaseOrder: { include: { Supplier: true, Store: true } },
      Supplier: true,
    },
  });
  console.log('return', JSON.stringify(r, null, 2));

  const vouchers = await p.voucher.findMany({
    where: {
      OR: [
        { narration: { contains: 'DPOR-2026-003' } },
        { narration: { contains: '080' } },
      ],
    },
    include: { VoucherEntry: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log('vouchers', JSON.stringify(vouchers.map(v => ({
    voucherNumber: v.voucherNumber,
    type: v.type,
    narration: v.narration,
    totalDebit: v.totalDebit,
    createdAt: v.createdAt,
    entries: v.VoucherEntry.map(e => ({
      accountName: e.accountName,
      debit: e.debit,
      credit: e.credit,
    })),
  })), null, 2));

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await p.$disconnect(); } catch (_) {}
  process.exit(1);
});
