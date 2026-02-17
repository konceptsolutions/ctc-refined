import { randomUUID } from "crypto";
import prisma from "../config/database";

const mainGroups = [
    { code: "1", name: "Current Assets", type: "Asset", displayOrder: 1 },
    { code: "3", name: "Current Liabilities", type: "Liability", displayOrder: 3 },
    { code: "4", name: "Long Term Liabilities", type: "Liability", displayOrder: 4 },
    { code: "5", name: "Capital", type: "Equity", displayOrder: 5 },
    { code: "7", name: "Revenues", type: "Revenue", displayOrder: 7 },
    { code: "8", name: "Expenses", type: "Expense", displayOrder: 8 },
    { code: "9", name: "Cost", type: "Expense", displayOrder: 9 },
];

const subGroups = [
    { code: "101", name: "Inventory", mainGroupCode: "1" },
    { code: "102", name: "Cash", mainGroupCode: "1" },
    { code: "103", name: "Bank", mainGroupCode: "1" },
    { code: "104", name: "Sales Customer Receivables", mainGroupCode: "1" },
    { code: "301", name: "Purchase Orders Payables", mainGroupCode: "3" },
    { code: "302", name: "Purchase expenses Payables", mainGroupCode: "3" },
    { code: "304", name: "Other Payables", mainGroupCode: "4" },
    { code: "501", name: "Owner Equity", mainGroupCode: "5" },
    { code: "701", name: "Goods Revenue", mainGroupCode: "7" },
    { code: "801", name: "Purchase Expenses", mainGroupCode: "8" },
    { code: "901", name: "Goods Purchased Cost", mainGroupCode: "9" },
];

const accounts = [
    { code: "101001", name: "Inventory", subGroupCode: "101", type: "asset" },
    { code: "102001", name: "Cash on Hand", subGroupCode: "102", type: "asset" },
    { code: "103001", name: "Bank Account", subGroupCode: "103", type: "asset" },
    { code: "104001", name: "General Customer Receivables", subGroupCode: "104", type: "asset" },
    { code: "301001", name: "General Purchase Payables", subGroupCode: "301", type: "liability" },
    { code: "302001", name: "General Purchase Expenses Payables", subGroupCode: "302", type: "liability" },
    { code: "304001", name: "General Other Payables", subGroupCode: "304", type: "liability" },
    { code: "501003", name: "OWNER CAPITAL", subGroupCode: "501", type: "equity" },
    { code: "701001", name: "Goods Sold", subGroupCode: "701", type: "revenue" },
    { code: "701002", name: "Goods Sold (Discounts)", subGroupCode: "701", type: "revenue" },
    { code: "801002", name: "Purchase Tax Expense", subGroupCode: "801", type: "expense" },
    { code: "801014", name: "Dispose Inventory", subGroupCode: "801", type: "expense" },
    { code: "901001", name: "Cost Inventory", subGroupCode: "901", type: "expense" },
    { code: "901002", name: "Cost Inventory (Discounts)", subGroupCode: "901", type: "expense" },
];

async function seed() {
    console.log("Starting Account Seeding...");

    // 1. Seed Main Groups
    for (const group of mainGroups) {
        try {
            // Check if exists
            const existing = await prisma.mainGroup.findUnique({
                where: { code: group.code },
            });

            if (!existing) {
                await prisma.mainGroup.create({
                    data: {
                        id: randomUUID(),
                        code: group.code,
                        name: group.name,
                        type: group.type,
                        displayOrder: group.displayOrder,
                        updatedAt: new Date(),
                    },
                });
                console.log(`Created MainGroup: ${group.name} (${group.code})`);
            } else {
                console.log(`Skipped MainGroup: ${group.name} (${group.code}) - Already exists`);
            }
        } catch (e) {
            console.error(`Error processing MainGroup ${group.code}:`, e);
        }
    }

    // 2. Seed Sub Groups
    for (const sub of subGroups) {
        try {
            const existing = await prisma.subgroup.findUnique({
                where: { code: sub.code },
            });

            if (!existing) {
                // Find Main Group ID
                const mainGroup = await prisma.mainGroup.findUnique({
                    where: { code: sub.mainGroupCode },
                });

                if (mainGroup) {
                    await prisma.subgroup.create({
                        data: {
                            id: randomUUID(),
                            code: sub.code,
                            name: sub.name,
                            mainGroupId: mainGroup.id,
                            isActive: true,
                            updatedAt: new Date(),
                        },
                    });
                    console.log(`Created SubGroup: ${sub.name} (${sub.code})`);
                } else {
                    console.error(`MainGroup ${sub.mainGroupCode} not found for SubGroup ${sub.code}`);
                }
            } else {
                console.log(`Skipped SubGroup: ${sub.name} (${sub.code}) - Already exists`);
            }
        } catch (e) {
            console.error(`Error processing SubGroup ${sub.code}:`, e);
        }
    }

    // 3. Seed Accounts
    for (const acc of accounts) {
        try {
            const existing = await prisma.account.findUnique({
                where: { code: acc.code },
            });

            if (!existing) {
                // Find Sub Group ID
                const subGroup = await prisma.subgroup.findUnique({
                    where: { code: acc.subGroupCode },
                });

                if (subGroup) {
                    await prisma.account.create({
                        data: {
                            id: randomUUID(),
                            code: acc.code,
                            name: acc.name,
                            subgroupId: subGroup.id,
                            accountType: acc.type,
                            status: "Active",
                            openingBalance: 0,
                            currentBalance: 0,
                            updatedAt: new Date(),
                        },
                    });
                    console.log(`Created Account: ${acc.name} (${acc.code})`);
                } else {
                    console.error(`SubGroup ${acc.subGroupCode} not found for Account ${acc.code}`);
                }
            } else {
                console.log(`Skipped Account: ${acc.name} (${acc.code}) - Already exists`);
            }
        } catch (e) {
            console.error(`Error processing Account ${acc.code}:`, e);
        }
    }

    console.log("Seeding Completed.");
}

seed()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
