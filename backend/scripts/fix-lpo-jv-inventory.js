const { PrismaClient } = require('../node_modules/.prisma/client');
const p = new PrismaClient();

(async () => {
  const inventory = await p.account.findFirst({
    where: { code: '101001', status: 'Active' },
  });
  if (!inventory) throw new Error('101001 Inventory not found');

  const vouchers = await p.voucher.findMany({
    where: { voucherNumber: { in: ['JV4556', 'JV4557'] } },
    include: { VoucherEntry: { orderBy: { sortOrder: 'asc' } } },
  });

  for (const v of vouchers) {
    const creditEntry = v.VoucherEntry.find((e) => Number(e.credit) > 0);
    if (!creditEntry) {
      console.log(`SKIP ${v.voucherNumber}: no credit entry`);
      continue;
    }
    if (creditEntry.accountId === inventory.id) {
      console.log(`OK ${v.voucherNumber}: already on Inventory`);
      continue;
    }

    const wrongId = creditEntry.accountId;
    const amount = Number(creditEntry.credit);

    await p.$transaction(async (tx) => {
      // Reverse wrong inventory-side balance (we previously decremented the wrong account)
      await tx.account.update({
        where: { id: wrongId },
        data: { currentBalance: { increment: amount } },
      });
      // Apply to real Inventory
      await tx.account.update({
        where: { id: inventory.id },
        data: { currentBalance: { decrement: amount } },
      });

      await tx.voucherEntry.update({
        where: { id: creditEntry.id },
        data: {
          accountId: inventory.id,
          accountName: `${inventory.code}-${inventory.name}`,
        },
      });
    });

    console.log(
      `FIXED ${v.voucherNumber}: credit ${amount} moved from ${creditEntry.accountName} -> ${inventory.code}-${inventory.name}`,
    );
  }

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try {
    await p.$disconnect();
  } catch (_) {}
  process.exit(1);
});
