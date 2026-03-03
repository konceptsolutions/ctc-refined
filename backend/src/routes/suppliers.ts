import express from "express";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const router = express.Router();
const prisma = new PrismaClient();

// Generate next supplier code
async function generateSupplierCode(): Promise<string> {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { code: { startsWith: "SUP-" } },
      select: { code: true },
    });

    let maxNum = 0;
    suppliers.forEach((s) => {
      if (s.code) {
        const match = s.code.match(/SUP-(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    });

    const nextNum = maxNum + 1;
    return `SUP-${String(nextNum).padStart(3, "0")}`;
  } catch (error) {
    return "SUP-001";
  }
}

// GET /api/suppliers - Get all suppliers with filters and pagination
router.get("/", async (req, res) => {
  try {
    const { search, fieldFilter, status, page = "1", limit = "10" } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = {};

    // Status filter
    if (status && status !== "all") {
      where.status = status;
    }

    // Search filter
    if (search) {
      const searchTerm = (search as string).toLowerCase();
      if (fieldFilter && fieldFilter !== "all") {
        switch (fieldFilter) {
          case "name":
            where.OR = [
              { name: { contains: searchTerm } },
              { companyName: { contains: searchTerm } },
            ];
            break;
          case "email":
            where.email = { contains: searchTerm };
            break;
          case "phone":
            where.phone = { contains: search as string };
            break;
        }
      } else {
        where.OR = [
          { companyName: { contains: searchTerm } },
          { email: { contains: searchTerm } },
          { code: { contains: searchTerm } },
          { phone: { contains: search as string } },
        ];
      }
    }

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        include: { Account: { select: { id: true } } }, // Include account IDs
      }),
      prisma.supplier.count({ where }),
    ]);

    // Map suppliers to include accountId
    const suppliersWithAccountId = suppliers.map((supplier: any) => ({
      ...supplier,
      accountId: supplier.Account?.length > 0 ? supplier.Account[0].id : null,
      Account: undefined, // Remove Account array from response
    }));

    res.json({
      data: suppliersWithAccountId,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/suppliers/:id - Get single supplier
router.get("/:id", async (req, res) => {
  try {
    const supplier = await prisma.supplier.findUnique({
      where: { id: req.params.id },
      include: { Account: true }, // Include linked accounts
    });

    if (!supplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    // Get the supplier's account ID if exists
    const accountId =
      supplier.Account.length > 0 ? supplier.Account[0].id : null;

    res.json({ data: { ...supplier, accountId } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/suppliers - Create new supplier
router.post("/", async (req, res) => {
  try {
    const {
      code,
      name,
      companyName,
      address,
      city,
      state,
      country,
      zipCode,
      email,
      phone,
      cnic,
      contactPerson,
      taxId,
      paymentTerms,
      openingBalance,
      date,
      status,
      notes,
      accountHead,
      shortTitle,
      referenceName,
      area,
      cellNumber,
      contactPersons,
      gstNumber,
      ntn,
      remarks,
    } = req.body;

    // Parse openingBalance to ensure it's a number (not a string)
    const parsedOpeningBalance = openingBalance
      ? parseFloat(openingBalance)
      : 0;

    // Auto-generate supplier code if not provided or empty
    const supplierCode =
      code && code.trim() !== "" ? code.trim() : await generateSupplierCode();

    const supplier = await prisma.supplier.create({
      data: {
        id: randomUUID(),
        code: supplierCode,
        name: name || null,
        companyName,
        address: address || null,
        city: city || null,
        state: state || null,
        country: country || null,
        zipCode: zipCode || null,
        email: email || null,
        phone: phone || null,
        cnic: cnic || null,
        contactPerson: contactPerson || null,
        taxId: taxId || null,
        paymentTerms: paymentTerms || null,
        openingBalance: parsedOpeningBalance,
        date: date ? new Date(date) : null,
        status: status || "active",
        notes: notes || null,
        accountHead: accountHead || null,
        shortTitle: shortTitle || null,
        referenceName: referenceName || null,
        area: area || null,
        cellNumber: cellNumber || null,
        contactPersons: contactPersons || [],
        gstNumber: gstNumber || null,
        ntn: ntn || null,
        remarks: remarks || null,
        updatedAt: new Date(),
      },
    });

    // ALWAYS create supplier account under Current Liabilities (subgroup 301)
    // This ensures all suppliers appear in Current Liabilities
    try {
      // Find Purchase Orders Payables subgroup (301) - Current Liabilities
      const payablesSubgroup = await prisma.subgroup.findFirst({
        where: { code: "301" },
      });

      if (payablesSubgroup) {
        // Generate account code: 301XXX where XXX is sequential
        const existingAccounts = await prisma.account.findMany({
          where: {
            code: {
              startsWith: "301",
            },
          },
          orderBy: {
            code: "desc",
          },
        });

        let accountCode = "301001";
        if (existingAccounts.length > 0) {
          const lastCode = existingAccounts[0].code;
          const match = lastCode.match(/^301(\d+)$/);
          if (match) {
            const lastNum = parseInt(match[1], 10);
            const nextNum = lastNum + 1;
            accountCode = `301${String(nextNum).padStart(3, "0")}`;
          }
        }

        // Check if account already exists for this supplier
        const existingAccount = await prisma.account.findFirst({
          where: {
            name: name || companyName,
            subgroupId: payablesSubgroup.id,
          },
        });

        if (!existingAccount) {
          // Create supplier account
          const supplierAccount = await prisma.account.create({
            data: {
              id: randomUUID(),
              subgroupId: payablesSubgroup.id,
              code: accountCode,
              name: `${name || companyName}`,
              description: `Supplier Account: ${companyName}`,
              openingBalance: 0,
              currentBalance: 0, // Start with 0, will be updated by voucher creation
              status: "Active",
              canDelete: false,
              supplierId: supplier.id, // Link account to supplier
              updatedAt: new Date(),
            },
          });

          // Create journal entry and update balances if opening balance is not 0
          if (parsedOpeningBalance !== 0) {
            // Find or create Owner Capital account (501003)
            let ownerCapitalAccount = await prisma.account.findFirst({
              where: { code: "501003" },
            });

            if (!ownerCapitalAccount) {
              // Find Capital subgroup (501)
              const capitalSubgroup = await prisma.subgroup.findFirst({
                where: { code: "501" },
              });

              if (!capitalSubgroup) {
                throw new Error(
                  "Capital subgroup (501) not found. Please create accounting structure first.",
                );
              }

              // Create Owner Capital account
              ownerCapitalAccount = await prisma.account.create({
                data: {
                  id: randomUUID(),
                  subgroupId: capitalSubgroup.id,
                  code: "501003",
                  name: "OWNER CAPITAL",
                  description:
                    "Owner Capital account for supplier opening balances",
                  openingBalance: 0,
                  currentBalance: 0,
                  status: "Active",
                  canDelete: false,
                  updatedAt: new Date(),
                },
              });
            }

            // Generate robust voucher number
            const lastVoucher = await prisma.voucher.findFirst({
              where: { voucherNumber: { startsWith: "JV-" } },
              orderBy: { voucherNumber: "desc" },
            });
            let nextNum = 1;
            if (lastVoucher) {
              const match = lastVoucher.voucherNumber.match(/JV-(\d+)/);
              if (match) {
                nextNum = parseInt(match[1], 10) + 1;
              }
            }
            const voucherNumber = `JV-${String(nextNum).padStart(4, "0")}`;

            const absBalance = Math.abs(parsedOpeningBalance);

            // Determine Debit/Credit entries
            // If Positive (> 0): Dr Owner Capital, Cr Supplier (Liability) -> Existing behavior
            // If Negative (< 0): Dr Supplier (Asset/Advance), Cr Owner Capital -> User Request
            const isPositive = parsedOpeningBalance > 0;

            const entry1 = {
              id: randomUUID(),
              accountId: ownerCapitalAccount.id,
              accountName: `${ownerCapitalAccount.code}-${ownerCapitalAccount.name}`,
              description: `Supplier Opening Balance: ${name || companyName} - ${absBalance}`,
              debit: isPositive ? absBalance : 0,
              credit: isPositive ? 0 : absBalance,
              sortOrder: 0,
              supplierId: supplier.id, // Link entry to supplier
            };

            const entry2 = {
              id: randomUUID(),
              accountId: supplierAccount.id,
              accountName: `${supplierAccount.code}-${supplierAccount.name}`,
              description: `Supplier Opening Balance: ${name || companyName} - ${absBalance}`,
              debit: isPositive ? 0 : absBalance,
              credit: isPositive ? absBalance : 0,
              sortOrder: 1,
              supplierId: supplier.id, // Link entry to supplier
            };

            // Create JV voucher for opening balance
            const voucher = await prisma.voucher.create({
              data: {
                id: randomUUID(),
                voucherNumber,
                type: "journal",
                date: date ? new Date(date) : new Date(),
                narration: `Supplier Opening Balance: ${name || companyName} (SUP-${supplierCode})`,
                totalDebit: absBalance,
                totalCredit: absBalance,
                status: "posted",
                createdBy: "System",
                approvedBy: "System",
                approvedAt: new Date(),
                isSystemGenerated: true,
                updatedAt: new Date(),
                VoucherEntry: {
                  create: [entry1, entry2],
                },
              },
              include: {
                VoucherEntry: true,
              },
            });

            // Update account balances
            // Owner Capital Account update
            await prisma.account.update({
              where: { id: ownerCapitalAccount.id },
              data: {
                currentBalance: {
                  increment: isPositive ? -absBalance : absBalance, // If Positive (Dr Capital), balance decreases. If Negative (Cr Capital), balance increases.
                },
              },
            });

            // Supplier Account update
            await prisma.account.update({
              where: { id: supplierAccount.id },
              data: {
                currentBalance: {
                  increment: isPositive ? absBalance : -absBalance, // If Positive (Cr Supplier), balance increases (Liability). If Negative (Dr Supplier), balance decreases (or negative liability).
                },
              },
            });
          } else {
            // No opening balance, just create the account
          }
        } else {
        }
      } else {
      }
    } catch (accountError: any) {
      // Don't fail supplier creation if account creation fails
    }

    res.status(201).json({ data: supplier });
  } catch (error: any) {
    if (error.code === "P2002") {
      return res.status(400).json({ error: "Supplier code already exists" });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/suppliers/:id - Update supplier
router.put("/:id", async (req, res) => {
  try {
    const {
      code,
      name,
      companyName,
      address,
      city,
      state,
      country,
      zipCode,
      email,
      phone,
      cnic,
      contactPerson,
      taxId,
      paymentTerms,
      openingBalance,
      date,
      status,
      notes,
      accountHead,
      shortTitle,
      referenceName,
      area,
      cellNumber,
      contactPersons,
      gstNumber,
      ntn,
      remarks,
      accountId, // Account ID from payload
    } = req.body;
    const updateData: any = {};
    if (code !== undefined) updateData.code = code;
    if (name !== undefined) updateData.name = name || null;
    if ("companyName" in req.body) updateData.companyName = companyName;
    if (address !== undefined) updateData.address = address || null;
    if (city !== undefined) updateData.city = city || null;
    if (state !== undefined) updateData.state = state || null;
    if (country !== undefined) updateData.country = country || null;
    if (zipCode !== undefined) updateData.zipCode = zipCode || null;
    if (email !== undefined) updateData.email = email || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (cnic !== undefined) updateData.cnic = cnic || null;
    if (contactPerson !== undefined)
      updateData.contactPerson = contactPerson || null;
    if (taxId !== undefined) updateData.taxId = taxId || null;
    if (paymentTerms !== undefined)
      updateData.paymentTerms = paymentTerms || null;
    if (openingBalance !== undefined)
      updateData.openingBalance = openingBalance
        ? parseFloat(openingBalance.toString())
        : 0;
    if (date !== undefined) updateData.date = date ? new Date(date) : null;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes || null;
    if (accountHead !== undefined) updateData.accountHead = accountHead || null;
    if (shortTitle !== undefined) updateData.shortTitle = shortTitle || null;
    if (referenceName !== undefined)
      updateData.referenceName = referenceName || null;
    if (area !== undefined) updateData.area = area || null;
    if (cellNumber !== undefined) updateData.cellNumber = cellNumber || null;
    if (contactPersons !== undefined)
      updateData.contactPersons = contactPersons || [];
    if (gstNumber !== undefined) updateData.gstNumber = gstNumber || null;
    if (ntn !== undefined) updateData.ntn = ntn || null;
    if (remarks !== undefined) updateData.remarks = remarks || null;

    // 1. Fetch old supplier data BEFORE update to check for opening balance change
    const oldSupplier = await prisma.supplier.findUnique({
      where: { id: req.params.id },
    });

    if (!oldSupplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    const supplier = await prisma.supplier.update({
      where: { id: req.params.id },
      data: updateData,
    });

    // 2. Handle Opening Balance Change
    const newOpeningBalance =
      openingBalance !== undefined
        ? openingBalance
          ? parseFloat(openingBalance.toString())
          : 0
        : oldSupplier.openingBalance;
    const oldOpeningBalance = oldSupplier.openingBalance;

    // 3. Handle Status or Name Change - Update associated account
    if (
      (status !== undefined && oldSupplier.status !== status) ||
      (companyName !== undefined && oldSupplier.companyName !== companyName) ||
      (name !== undefined && oldSupplier.name !== name)
    ) {
      try {
        console.log(
          `[SYNC-DEBUG] Sync triggering for Supplier ID: ${req.params.id}`,
        );
        console.log(`[SYNC-DEBUG] Status: ${oldSupplier.status} -> ${status}`);
        console.log(
          `[SYNC-DEBUG] CompanyName: ${oldSupplier.companyName} -> ${companyName}`,
        );
        console.log(
          `[SYNC-DEBUG] Name (Contact): ${oldSupplier.name} -> ${name}`,
        );

        // Find the associated supplier account
        const supplierAccount = await prisma.account.findFirst({
          where: { supplierId: req.params.id },
        });

        if (supplierAccount) {
          console.log(
            `[SYNC-DEBUG] Found associated account: ${supplierAccount.code} (${supplierAccount.name})`,
          );
          const updateAccountData: any = {};

          // Handle Status synchronization
          if (status !== undefined && oldSupplier.status !== status) {
            updateAccountData.status =
              status === "active" ? "Active" : "Inactive";
          }

          // Handle Name synchronization
          if (
            (companyName !== undefined &&
              oldSupplier.companyName !== companyName) ||
            (name !== undefined && oldSupplier.name !== name)
          ) {
            // Priority: new name > new company > old name > old company
            const finalName = name !== undefined ? name : oldSupplier.name;
            const finalCompany =
              companyName !== undefined ? companyName : oldSupplier.companyName;
            const newAccountName = finalName || finalCompany;

            console.log(
              `[SYNC-DEBUG] Calculated new account name: "${newAccountName}"`,
            );
            updateAccountData.name = newAccountName;
            updateAccountData.description = `Supplier Account: ${finalCompany}`;
          }

          if (Object.keys(updateAccountData).length > 0) {
            const updatedAccount = await prisma.account.update({
              where: { id: supplierAccount.id },
              data: updateAccountData,
            });
            console.log(
              `[SYNC-DEBUG] SUCCESS: Updated account ${updatedAccount.code}. New Name: "${updatedAccount.name}", Status: ${updatedAccount.status}`,
            );
          } else {
            console.log(`[SYNC-DEBUG] No actual changes needed for account.`);
          }
        } else {
          console.warn(
            `[SYNC-DEBUG] WARNING: No account found for supplier ID: ${req.params.id}`,
          );
        }
      } catch (err: any) {
        console.error(
          "[SYNC-DEBUG] ERROR synchronizing supplier account:",
          err,
        );
      }
    }

    if (newOpeningBalance !== oldOpeningBalance) {
      try {
        console.log(
          `Updating Opening Balance for ${oldSupplier.code}: ${oldOpeningBalance} -> ${newOpeningBalance}`,
        );

        // A. Find and DELETE Old Voucher
        // Broad search: Contains Code AND "Opening Balance"
        // This is safer and catches legacy formats
        const oldVoucher = await prisma.voucher.findFirst({
          where: {
            AND: [
              { narration: { contains: oldSupplier.code } },
              { narration: { contains: "Opening Balance" } },
            ],
            status: "posted",
          },
          include: { VoucherEntry: true },
        });

        let supplierAccountId: string | null = null;
        let ownerCapitalAccountId: string | null = null;

        // Reversal & Delete Logic
        if (oldVoucher) {
          console.log("Found old voucher to delete:", oldVoucher.voucherNumber);

          // Reverse impact of old entries
          for (const entry of oldVoucher.VoucherEntry) {
            // Determine account type (assume Liab/Equity for Supplier/Capital)
            // To Reverse: Debit -> Add to Balance (increment: debit)
            //             Credit -> Subtract from Balance (increment: -credit)
            // Net Increment = debit - credit
            if (entry.accountId) {
              await prisma.account.update({
                where: { id: entry.accountId },
                data: {
                  currentBalance: { increment: entry.debit - entry.credit },
                },
              });
            }

            // Capture IDs for reuse
            const desc = entry.description || "";
            const name = entry.accountName || "";

            // Check OWNER CAPITAL first (this is the more specific check)
            if (name.includes("OWNER CAPITAL") || name.includes("501003")) {
              ownerCapitalAccountId = entry.accountId;
            } else if (
              oldSupplier.companyName &&
              (name.includes(oldSupplier.companyName) ||
                desc.includes(oldSupplier.companyName))
            ) {
              // Only match supplier if we have a non-empty company name
              supplierAccountId = entry.accountId;
            } else if (
              !supplierAccountId &&
              entry.accountId !== ownerCapitalAccountId
            ) {
              // Fallback: if not Owner Capital, assume it's the supplier account
              supplierAccountId = entry.accountId;
            }
          }

          // Hard Delete
          await prisma.voucherEntry.deleteMany({
            where: { voucherId: oldVoucher.id },
          });
          await prisma.voucher.delete({ where: { id: oldVoucher.id } });
        } else {
          console.log("No old voucher found with code:", oldSupplier.code);
        }

        // B. Create New Voucher (if new balance is non-zero)
        console.log(
          "New Opening Balance:",
          newOpeningBalance,
          "Will create voucher:",
          newOpeningBalance !== 0,
        );
        if (newOpeningBalance !== 0) {
          console.log("Entering voucher creation block...");
          // Find Accounts - Use accountId from payload (most reliable)
          console.log("SupplierAccountId from old voucher:", supplierAccountId);
          console.log("AccountId from payload:", accountId);

          // Priority: 1. Payload accountId, 2. Old voucher, 3. FK lookup, 4. Name lookup
          if (!supplierAccountId && accountId) {
            supplierAccountId = accountId;
            console.log("Using accountId from payload:", supplierAccountId);
          }

          if (!supplierAccountId) {
            console.log("Looking up account by supplierId:", supplier.id);
            // Find by supplierId FK
            const accountByFk = await prisma.account.findFirst({
              where: { supplierId: supplier.id },
            });
            console.log("Account found by supplierId FK:", accountByFk);
            if (accountByFk) {
              supplierAccountId = accountByFk.id;
            } else {
              // Fallback: Find by name (for legacy accounts without FK)
              console.log("Falling back to name lookup...");
              const payablesSubgroup = await prisma.subgroup.findFirst({
                where: { code: "301" },
              });
              if (payablesSubgroup) {
                const foundAccount = await prisma.account.findFirst({
                  where: {
                    OR: [
                      { name: oldSupplier.companyName || undefined },
                      { name: supplier.companyName || undefined },
                    ],
                    subgroupId: payablesSubgroup.id,
                  },
                });
                console.log("Account found by name:", foundAccount);
                if (foundAccount) supplierAccountId = foundAccount.id;
              }
            }
          }
          const foundCapital = await prisma.account.findFirst({
            where: { code: "501003" },
          });
          console.log("Owner Capital Account found:", foundCapital);
          if (foundCapital) ownerCapitalAccountId = foundCapital.id;

          console.log(
            "Final Account IDs - Supplier:",
            supplierAccountId,
            "Capital:",
            ownerCapitalAccountId,
          );

          if (supplierAccountId && ownerCapitalAccountId) {
            const absBalance = Math.abs(newOpeningBalance);
            const isPositive = newOpeningBalance > 0;

            const lastVoucher = await prisma.voucher.findFirst({
              where: { voucherNumber: { startsWith: "JV-" } },
              orderBy: { voucherNumber: "desc" },
            });
            let nextNum = 1;
            if (lastVoucher) {
              const match = lastVoucher.voucherNumber.match(/JV-(\d+)/);
              if (match) nextNum = parseInt(match[1], 10) + 1;
            }
            const voucherNumber = `JV-${String(nextNum).padStart(4, "0")}`;

            // Fetch fresh
            const supAcc = await prisma.account.findUnique({
              where: { id: supplierAccountId },
            });
            const capAcc = await prisma.account.findUnique({
              where: { id: ownerCapitalAccountId },
            });

            if (supAcc && capAcc) {
              const entry1 = {
                id: randomUUID(),
                accountId: ownerCapitalAccountId,
                accountName: `${capAcc.code}-${capAcc.name}`,
                description: `Supplier Opening Balance: ${supplier.companyName} - ${absBalance}`,
                debit: isPositive ? absBalance : 0,
                credit: isPositive ? 0 : absBalance,
                sortOrder: 0,
                supplierId: supplier.id, // Link entry to supplier
              };

              const entry2 = {
                id: randomUUID(),
                accountId: supplierAccountId,
                accountName: `${supAcc.code}-${supAcc.name}`,
                description: `Supplier Opening Balance: ${supplier.companyName} - ${absBalance}`,
                debit: isPositive ? 0 : absBalance,
                credit: isPositive ? absBalance : 0,
                sortOrder: 1,
                supplierId: supplier.id, // Link entry to supplier
              };

              await prisma.voucher.create({
                data: {
                  id: randomUUID(),
                  voucherNumber,
                  type: "journal",
                  date: supplier.date ? new Date(supplier.date) : new Date(),
                  narration: `Supplier Opening Balance: ${supplier.companyName} (SUP-${supplier.code})`,
                  totalDebit: absBalance,
                  totalCredit: absBalance,
                  status: "posted",
                  createdBy: "System",
                  approvedBy: "System",
                  approvedAt: new Date(),
                  isSystemGenerated: true,
                  updatedAt: new Date(),
                  VoucherEntry: {
                    create: [entry1, entry2],
                  },
                },
              });

              // Update New Balances
              await prisma.account.update({
                where: { id: supplierAccountId },
                data: {
                  currentBalance: { increment: entry2.credit - entry2.debit },
                },
              });

              await prisma.account.update({
                where: { id: ownerCapitalAccountId },
                data: {
                  currentBalance: { increment: entry1.credit - entry1.debit },
                },
              });

              if (oldSupplier.companyName !== supplier.companyName) {
                await prisma.account.update({
                  where: { id: supplierAccountId },
                  data: {
                    name: supplier.companyName,
                    description: `Supplier Account: ${supplier.companyName}`,
                  },
                });
              }
            }
          } else {
            console.error("Accounts not found for New Supplier Voucher");
          }
        }
      } catch (err) {
        console.error("Error updating supplier opening balance voucher:", err);
      }
    }

    // Add a debug header to response
    res.set("X-Backend-Version", "1.0.2-sync-debug");
    res.json({ data: supplier });
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Supplier not found" });
    }
    if (error.code === "P2002") {
      return res.status(400).json({ error: "Supplier code already exists" });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/suppliers/:id - Delete supplier
router.delete("/:id", async (req, res) => {
  try {
    await prisma.supplier.delete({
      where: { id: req.params.id },
    });

    res.json({ message: "Supplier deleted successfully" });
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Supplier not found" });
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;
