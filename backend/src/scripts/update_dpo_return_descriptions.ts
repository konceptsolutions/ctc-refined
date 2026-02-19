
import prisma from '../config/database';

async function updateVoucherDescriptions() {
    try {
        console.log("Starting Voucher Description Update for DPO Returns...");

        // 1. Find all Journal and Receipt Vouchers related to DPO Returns
        const vouchers = await prisma.voucher.findMany({
            where: {
                narration: {
                    contains: "DPO Return DPOR-",
                },
            },
            include: {
                VoucherEntry: true,
            },
        });

        console.log(`Found ${vouchers.length} potential vouchers to update.`);

        for (const voucher of vouchers) {
            const narration = voucher.narration || "";
            // Extract DPOR Number (e.g., DPOR-2026-006)
            const match = narration.match(/(DPOR-\d{4}-\d{3})/);

            if (!match) {
                console.log(`Skipping Voucher ${voucher.voucherNumber} - Could not extract Return Number from narration: "${narration}"`);
                continue;
            }

            const returnNumber = match[1];
            console.log(`Processing Voucher ${voucher.voucherNumber} for Return ${returnNumber}`);

            // 2. Fetch the DPO Return Details
            const dpoReturn = await prisma.directPurchaseOrderReturn.findUnique({
                where: { returnNumber },
                include: {
                    DirectPurchaseOrderReturnItem: {
                        include: {
                            Part: {
                                include: {
                                    Brand: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!dpoReturn) {
                console.warn(`Warning: DPO Return ${returnNumber} not found in database.`);
                continue;
            }

            // 3. Construct Item Details String
            let itemDetailsStr = "";
            const items = dpoReturn.DirectPurchaseOrderReturnItem;

            for (const item of items) {
                const partNo = item.Part?.partNo || "Unknown";
                const brand = item.Part?.Brand?.name || "No Brand";
                const desc = item.Part?.description || "";
                const qty = item.returnQuantity;
                const price = item.originalPurchasePrice;

                const detail = `${partNo} - ${brand} - ${desc} (${qty} x ${price})`;
                itemDetailsStr += itemDetailsStr ? `, ${detail}` : detail;
            }

            const newDescription = `Return ${returnNumber}: ${itemDetailsStr}`;

            console.log(`  -> New Description: "${newDescription}"`);

            // 4. Update Voucher Entries
            const updateResult = await prisma.voucherEntry.updateMany({
                where: {
                    voucherId: voucher.id,
                },
                data: {
                    description: newDescription,
                },
            });

            console.log(`  -> Updated ${updateResult.count} entries.`);
        }

        console.log("Done.");
    } catch (error) {
        console.error("Error updating vouchers:", error);
    } finally {
        await prisma.$disconnect();
    }
}

updateVoucherDescriptions();
