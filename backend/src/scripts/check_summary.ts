import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const accounts = await prisma.account.findMany({
        include: {
            Subgroup: {
                include: {
                    MainGroup: true
                }
            }
        }
    });

    console.log("Categories and Account counts:");
    const summary: Record<string, number> = {};
    accounts.forEach(acc => {
        const type = acc.Subgroup.MainGroup.type;
        summary[type] = (summary[type] || 0) + 1;
    });
    console.log(JSON.stringify(summary, null, 2));

    // Check if any vouchers hit Revenue/Expense/Cost
    const vEntries = await prisma.voucherEntry.findMany({
        include: {
            Account: {
                include: {
                    Subgroup: {
                        include: {
                            MainGroup: true
                        }
                    }
                }
            }
        }
    });

    console.log("\nVoucher Entries by Category:");
    const vSummary: Record<string, number> = {};
    vEntries.forEach(ve => {
        const type = ve.Account?.Subgroup.MainGroup.type || "Unknown";
        vSummary[type] = (vSummary[type] || 0) + 1;
    });
    console.log(JSON.stringify(vSummary, null, 2));

    await prisma.$disconnect();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
