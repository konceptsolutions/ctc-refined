import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Starting Voucher Reconciliation...");

    // 1. Find all voucher entries where accountId is null
    const entries = await prisma.voucherEntry.findMany({
        where: { accountId: null },
        include: {
            Voucher: true
        }
    });

    console.log(`Found ${entries.length} entries with null accountId.`);

    let fixCount = 0;
    let balanceHitCount = 0;

    for (const entry of entries) {
        // Check if accountName is a UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(entry.accountName)) {
            const accountId = entry.accountName;

            // Verify account exists
            const account = await prisma.account.findUnique({
                where: { id: accountId },
                include: { Subgroup: { include: { MainGroup: true } } }
            });

            if (account) {
                console.log(`Fixing entry ${entry.id}: Linking to account ${account.name} (${account.code})`);

                // Update the entry
                await prisma.voucherEntry.update({
                    where: { id: entry.id },
                    data: {
                        accountId: accountId,
                        accountName: account.name
                    }
                });
                fixCount++;

                // If voucher is posted, update account balance (since it was skipped before)
                if (entry.Voucher.status === 'posted') {
                    const mainType = account.Subgroup.MainGroup.type.toLowerCase();
                    const isDebitNormal = mainType === 'asset' || mainType === 'expense' || mainType === 'cost';

                    const balanceChange = isDebitNormal
                        ? (entry.debit || 0) - (entry.credit || 0)
                        : (entry.credit || 0) - (entry.debit || 0);

                    if (balanceChange !== 0) {
                        await prisma.account.update({
                            where: { id: accountId },
                            data: {
                                currentBalance: {
                                    increment: balanceChange
                                }
                            }
                        });
                        balanceHitCount++;
                    }
                }
            }
        }
    }

    console.log(`Reconciliation finished.`);
    console.log(`Entries fixed: ${fixCount}`);
    console.log(`Account balances updated: ${balanceHitCount}`);

    await prisma.$disconnect();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
