const { PrismaClient } = require('../node_modules/.prisma/client');
const p = new PrismaClient();

(async () => {
  const returns = await p.directPurchaseOrderReturn.findMany({
    include: {
      DirectPurchaseOrderReturnItem: { include: { Part: true } },
    },
  });

  for (const r of returns) {
    const itemDetailsStr = (r.DirectPurchaseOrderReturnItem || [])
      .map((i) => {
        const name = i.Part?.partNumber || i.Part?.name || i.partId;
        return `${name} x${i.returnQuantity}`;
      })
      .join(', ');
    const desc = `Return ${r.returnNumber}: ${itemDetailsStr}`;

    const entries = await p.voucherEntry.findMany({
      where: {
        description: { contains: r.returnNumber },
      },
    });
    for (const e of entries) {
      if (e.description !== desc) {
        await p.voucherEntry.update({
          where: { id: e.id },
          data: { description: desc },
        });
      }
    }
    console.log(`${r.returnNumber}: ${desc}`);
  }

  const v = await p.voucher.findMany({
    where: { voucherNumber: { in: ['JV4556', 'JV4557'] } },
    include: { VoucherEntry: { orderBy: { sortOrder: 'asc' } } },
  });
  console.log(
    JSON.stringify(
      v.map((x) => ({
        voucherNumber: x.voucherNumber,
        narration: x.narration,
        totalDebit: x.totalDebit,
        entries: x.VoucherEntry.map((e) => ({
          accountName: e.accountName,
          debit: e.debit,
          credit: e.credit,
          description: e.description,
        })),
      })),
      null,
      2,
    ),
  );
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try {
    await p.$disconnect();
  } catch (_) {}
  process.exit(1);
});
