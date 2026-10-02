const crypto = require('crypto');
const { PrismaClient } = require('../node_modules/.prisma/client');
const p = new PrismaClient();

async function nextJvNumber(tx) {
  const jvCandidates = await tx.voucher.findMany({
    where: { type: 'journal', voucherNumber: { startsWith: 'JV' } },
    select: { voucherNumber: true },
  });
  let jvMax = 0;
  for (const v of jvCandidates) {
    const match = String(v.voucherNumber).match(/^JV(\d+)$/);
    if (match) jvMax = Math.max(jvMax, parseInt(match[1], 10));
  }
  return `JV${String(jvMax + 1).padStart(4, '0')}`;
}

async function resolveAccounts(tx, supplierId) {
  let inventoryAccount = await tx.account.findFirst({
    where: { code: '101001', status: 'Active' },
  });
  if (!inventoryAccount) {
    inventoryAccount = await tx.account.findFirst({
      where: {
        OR: [{ code: '104005' }, { code: '104001' }],
        status: 'Active',
      },
    });
  }

  let supplierAccount = null;
  if (supplierId) {
    supplierAccount = await tx.account.findFirst({
      where: {
        supplierId,
        status: 'Active',
        Subgroup: { code: '301' },
      },
    });
    if (!supplierAccount) {
      supplierAccount = await tx.account.findFirst({
        where: { supplierId, status: 'Active' },
      });
    }
  }

  if (!supplierAccount && supplierId) {
    const supplier = await tx.supplier.findUnique({
      where: { id: supplierId },
      select: { companyName: true, name: true },
    });
    if (supplier) {
      const payablesSubgroup = await tx.subgroup.findFirst({
        where: { code: '301' },
      });
      if (payablesSubgroup) {
        const nameOrCompany = [supplier.name, supplier.companyName]
          .map((n) => String(n || '').trim())
          .filter(Boolean);
        if (nameOrCompany.length > 0) {
          supplierAccount = await tx.account.findFirst({
            where: {
              subgroupId: payablesSubgroup.id,
              status: 'Active',
              OR: nameOrCompany.map((n) => ({
                name: { equals: n, mode: 'insensitive' },
              })),
            },
          });
        }
      }
    }
  }

  if (!supplierAccount) {
    supplierAccount = await tx.account.findFirst({
      where: {
        OR: [{ code: '301001' }, { name: 'Accounts Payable' }],
        status: 'Active',
      },
    });
  }

  return { inventoryAccount, supplierAccount };
}

(async () => {
  const returns = await p.directPurchaseOrderReturn.findMany({
    include: {
      DirectPurchaseOrderReturnItem: { include: { Part: true } },
      DirectPurchaseOrder: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${returns.length} LPO return(s)`);
  const created = [];

  for (const r of returns) {
    const existing = await p.voucher.findMany({
      where: { narration: { contains: r.returnNumber } },
      select: { voucherNumber: true, type: true },
    });
    if (existing.length > 0) {
      console.log(
        `SKIP ${r.returnNumber}: already has ${existing.map((v) => v.voucherNumber).join(', ')}`,
      );
      continue;
    }

    const totalAmount = Number(r.totalAmount || 0);
    if (!(totalAmount > 0)) {
      console.log(`SKIP ${r.returnNumber}: totalAmount is 0`);
      continue;
    }

    const dpoNumber = r.DirectPurchaseOrder?.dpoNumber || '';
    const itemDetailsStr = (r.DirectPurchaseOrderReturnItem || [])
      .map((i) => `${i.Part?.partNo || i.partId} x${i.returnQuantity}`)
      .join(', ');

    const result = await p.$transaction(async (tx) => {
      const { inventoryAccount, supplierAccount } = await resolveAccounts(
        tx,
        r.supplierId || r.DirectPurchaseOrder?.supplierId,
      );
      if (!inventoryAccount) throw new Error(`Inventory account missing for ${r.returnNumber}`);
      if (!supplierAccount) throw new Error(`Supplier account missing for ${r.returnNumber}`);

      const jvVoucherNumber = await nextJvNumber(tx);
      const voucherDescription = `Return ${r.returnNumber}: ${itemDetailsStr}`;

      await tx.voucher.create({
        data: {
          id: crypto.randomUUID(),
          voucherNumber: jvVoucherNumber,
          type: 'journal',
          date: new Date(r.returnDate),
          narration: `LPO Return ${r.returnNumber} - Inventory Adjusted (LPO ${dpoNumber})`,
          totalDebit: totalAmount,
          totalCredit: totalAmount,
          status: 'posted',
          createdBy: 'System',
          approvedBy: 'System',
          approvedAt: new Date(),
          updatedAt: new Date(),
          VoucherEntry: {
            create: [
              {
                id: crypto.randomUUID(),
                accountId: supplierAccount.id,
                accountName: `${supplierAccount.code}-${supplierAccount.name}`,
                description: voucherDescription,
                debit: totalAmount,
                credit: 0,
                sortOrder: 0,
              },
              {
                id: crypto.randomUUID(),
                accountId: inventoryAccount.id,
                accountName: `${inventoryAccount.code}-${inventoryAccount.name}`,
                description: voucherDescription,
                debit: 0,
                credit: totalAmount,
                sortOrder: 1,
              },
            ],
          },
        },
      });

      await tx.account.update({
        where: { id: supplierAccount.id },
        data: { currentBalance: { decrement: totalAmount } },
      });
      await tx.account.update({
        where: { id: inventoryAccount.id },
        data: { currentBalance: { decrement: totalAmount } },
      });

      return {
        returnNumber: r.returnNumber,
        jvVoucherNumber,
        totalAmount,
        supplierAccount: `${supplierAccount.code}-${supplierAccount.name}`,
        inventoryAccount: `${inventoryAccount.code}-${inventoryAccount.name}`,
      };
    });

    created.push(result);
    console.log(
      `CREATED ${result.returnNumber} -> ${result.jvVoucherNumber} amount=${result.totalAmount} DR ${result.supplierAccount} / CR ${result.inventoryAccount}`,
    );
  }

  console.log('\nDone. Created:', JSON.stringify(created, null, 2));
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try {
    await p.$disconnect();
  } catch (_) {}
  process.exit(1);
});
