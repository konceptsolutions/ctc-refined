import express from "express";
import { PrismaClient } from "@prisma/client";

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/customers - Get all customers with filters and pagination
router.get("/", async (req, res) => {
  try {
    const { search, searchBy, status, page = "1", limit = "10" } = req.query;

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
    if (search && searchBy) {
      const searchTerm = (search as string).toLowerCase();
      switch (searchBy) {
        case "name":
          where.name = { contains: searchTerm };
          break;
        case "email":
          where.email = { contains: searchTerm };
          break;
        case "cnic":
          where.cnic = { contains: search as string };
          break;
        case "contact":
          where.contactNo = { contains: search as string };
          break;
        default:
          where.OR = [
            { name: { contains: searchTerm } },
            { email: { contains: searchTerm } },
          ];
      }
    }

    // Fetch all customers (we'll filter out "Demo" customers in memory since SQLite doesn't support case-insensitive mode)
    const [allCustomers, totalBeforeFilter] = await Promise.all([
      prisma.customer.findMany({
        where: {
          status: "active",
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.customer.count({ where }),
    ]);

    // Filter out "Demo" customers (case-insensitive) - SQLite doesn't support mode: 'insensitive'
    const filteredCustomers = allCustomers.filter(
      (customer: any) => !customer.name.toLowerCase().includes("demo"),
    );

    // Apply pagination after filtering
    const total = filteredCustomers.length;
    const paginatedCustomers = filteredCustomers.slice(skip, skip + limitNum);

    // Map customers to include accountId
    const customersWithAccountId = paginatedCustomers.map((customer: any) => ({
      ...customer,
      accountId: null, // Set to null since we don't have accounts data
      accounts: undefined, // Remove accounts array from response
    }));

    res.json({
      data: customersWithAccountId,
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

// GET /api/customers/:id - Get single customer
router.get("/:id", async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Get the customer's account ID if exists
    const accountId = null; // Set to null since we don't have accounts data

    res.json({ data: { ...customer, accountId } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/customers - Create new customer
router.post("/", async (req, res) => {
  try {
    const {
      name,
      address,
      email,
      cnic,
      contactNo,
      openingBalance,
      date,
      creditLimit,
      status,
      priceType,
      code,
      accountHead,
      title,
      shortTitle,
      referenceName,
      area,
      cellNumber,
      contactPersons,
      gstNumber,
      pstNumber,
      ntn,
      remarks,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Customer name is required" });
    }

    // Parse openingBalance to ensure it's a number (not a string)
    const parsedOpeningBalance = openingBalance
      ? parseFloat(openingBalance)
      : 0;

    const customer = await prisma.customer.create({
      data: {
        id: crypto.randomUUID(), // Generate unique ID
        name,
        address: address || null,
        email: email || null,
        cnic: cnic || null,
        contactNo: contactNo || null,
        openingBalance: parsedOpeningBalance, // Use parsed value
        date: date ? new Date(date) : null,
        creditLimit: creditLimit ? parseFloat(creditLimit) : 0,
        status: status || "active",
        priceType: priceType || null,
        code: code || null,
        accountHead: accountHead || null,
        title: title || null,
        shortTitle: shortTitle || null,
        referenceName: referenceName || null,
        area: area || null,
        cellNumber: cellNumber || null,
        contactPersons: contactPersons || [],
        gstNumber: gstNumber || null,
        pstNumber: pstNumber || null,
        ntn: ntn || null,
        remarks: remarks || null,
        updatedAt: new Date(), // Add updatedAt
      },
    });

    // ALWAYS create customer account under Current Assets (subgroup 103)
    // This ensures all customers appear in Current Assets as Accounts Receivable
    try {
      // Find Accounts Receivable subgroup (103) - Current Assets
      const receivablesSubgroup = await prisma.subgroup.findFirst({
        where: { code: "103" },
      });

      if (receivablesSubgroup) {
        // Generate account code: 103XXX where XXX is sequential
        const existingAccounts = await prisma.account.findMany({
          where: {
            code: {
              startsWith: "103",
            },
          },
          orderBy: {
            code: "desc",
          },
        });

        let accountCode = "103001";
        if (existingAccounts.length > 0) {
          const lastCode = existingAccounts[0].code;
          const match = lastCode.match(/^103(\d+)$/);
          if (match) {
            const lastNum = parseInt(match[1], 10);
            const nextNum = lastNum + 1;
            accountCode = `103${String(nextNum).padStart(3, "0")}`;
          }
        }

        // Check if account already exists for this customer
        const existingAccount = await prisma.account.findFirst({
          where: {
            name: name,
            subgroupId: receivablesSubgroup.id,
          },
        });

        if (!existingAccount) {
          // Create customer account
          const customerAccount = await prisma.account.create({
            data: {
              subgroupId: receivablesSubgroup.id,
              code: accountCode,
              name: name,
              description: `Customer Account: ${name}`,
              openingBalance: 0,
              currentBalance: parsedOpeningBalance || 0, // Set initial balance if opening balance exists
              status: "Active",
              canDelete: false,
              customerId: customer.id, // Link account to customer
              id: `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              updatedAt: new Date(),
            },
          });

          // Create journal entry and update balances ONLY if opening balance is not 0
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
                  subgroupId: capitalSubgroup.id,
                  code: "501003",
                  name: "OWNER CAPITAL",
                  description:
                    "Owner Capital account for customer opening balances",
                  openingBalance: 0,
                  currentBalance: 0,
                  status: "Active",
                  canDelete: false,
                  id: `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
            const isPositive = parsedOpeningBalance > 0;

            // Determine entries
            // If Positive (> 0): Dr Customer (Asset), Cr Owner Capital -> Existing
            // If Negative (< 0): Dr Owner Capital, Cr Customer (Liability/Advance) -> New

            const customerEntry = {
              id: crypto.randomUUID(), // Add required ID
              accountId: customerAccount.id,
              accountName: `${customerAccount.code}-${customerAccount.name}`,
              description: `Customer Opening Balance: ${name} - ${absBalance}`,
              debit: isPositive ? absBalance : 0,
              credit: isPositive ? 0 : absBalance,
              sortOrder: 0,
              customerId: customer.id, // Link entry to customer
            };

            const capitalEntry = {
              id: crypto.randomUUID(), // Add required ID
              accountId: ownerCapitalAccount.id,
              accountName: `${ownerCapitalAccount.code}-${ownerCapitalAccount.name}`,
              description: `Customer Opening Balance: ${name} - ${absBalance}`,
              debit: isPositive ? 0 : absBalance,
              credit: isPositive ? absBalance : 0,
              sortOrder: 1,
              customerId: customer.id, // Link entry to customer
            };

            // Create JV voucher for opening balance
            const voucher = await prisma.voucher.create({
              data: {
                id: crypto.randomUUID(), // Add required ID
                voucherNumber,
                type: "journal",
                date: date ? new Date(date) : new Date(),
                narration: `Customer Opening Balance: ${name} (CUST-${customer.id})`,
                totalDebit: absBalance,
                totalCredit: absBalance,
                status: "posted",
                createdBy: "System",
                approvedBy: "System",
                approvedAt: new Date(),
                isSystemGenerated: true,
                updatedAt: new Date(), // Add required updatedAt
                VoucherEntry: {
                  // Use VoucherEntry instead of entries
                  create: [customerEntry, capitalEntry],
                },
              },
            });

            // Update account balances
            await prisma.account.update({
              where: { id: ownerCapitalAccount.id },
              data: {
                currentBalance: {
                  // If Positive (Cr Capital), balance increases. If Negative (Dr Capital), balance decreases.
                  increment: isPositive ? absBalance : -absBalance,
                },
              },
            });

            await prisma.account.update({
              where: { id: customerAccount.id },
              data: {
                currentBalance: {
                  // If Positive (Dr Customer), balance increases. If Negative (Cr Customer), balance decreases (becomes negative).
                  increment: parsedOpeningBalance,
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
      // Don't fail customer creation if account creation fails
    }

    res.status(201).json({ data: customer });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/customers/:id - Update customer
router.put("/:id", async (req, res) => {
  try {
    const {
      name,
      address,
      email,
      cnic,
      contactNo,
      openingBalance,
      date,
      creditLimit,
      status,
      priceType,
      accountId, // Account ID from payload
      code,
      accountHead,
      title,
      shortTitle,
      referenceName,
      area,
      cellNumber,
      contactPersons,
      gstNumber,
      pstNumber,
      ntn,
      remarks,
    } = req.body;
    // 1. Fetch old customer data BEFORE update
    const oldCustomer = await prisma.customer.findUnique({
      where: { id: req.params.id },
    });

    if (!oldCustomer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (address !== undefined) updateData.address = address || null;
    if (email !== undefined) updateData.email = email || null;
    if (cnic !== undefined) updateData.cnic = cnic || null;
    if (contactNo !== undefined) updateData.contactNo = contactNo || null;
    if (openingBalance !== undefined)
      updateData.openingBalance = openingBalance
        ? parseFloat(openingBalance.toString())
        : 0;
    if (date !== undefined) updateData.date = date ? new Date(date) : null;
    if (creditLimit !== undefined)
      updateData.creditLimit = parseFloat(creditLimit.toString());
    if (status !== undefined) updateData.status = status;
    if (priceType !== undefined) updateData.priceType = priceType || null;
    if (code !== undefined) updateData.code = code || null;
    if (accountHead !== undefined) updateData.accountHead = accountHead || null;
    if (title !== undefined) updateData.title = title || null;
    if (shortTitle !== undefined) updateData.shortTitle = shortTitle || null;
    if (referenceName !== undefined)
      updateData.referenceName = referenceName || null;
    if (area !== undefined) updateData.area = area || null;
    if (cellNumber !== undefined) updateData.cellNumber = cellNumber || null;
    if (contactPersons !== undefined)
      updateData.contactPersons = contactPersons;
    if (gstNumber !== undefined) updateData.gstNumber = gstNumber || null;
    if (pstNumber !== undefined) updateData.pstNumber = pstNumber || null;
    if (ntn !== undefined) updateData.ntn = ntn || null;
    if (remarks !== undefined) updateData.remarks = remarks || null;

    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: updateData,
    });

    // 2. Handle Opening Balance Change
    const newOpeningBalance =
      openingBalance !== undefined
        ? openingBalance
          ? parseFloat(openingBalance.toString())
          : 0
        : oldCustomer.openingBalance;
    const oldOpeningBalance = oldCustomer.openingBalance;

    // 3. Handle Status or Name Change - Update associated account
    if (
      (status !== undefined && oldCustomer.status !== status) ||
      (name !== undefined && oldCustomer.name !== name)
    ) {
      try {
        console.log(
          `[SYNC-DEBUG] Sync triggering for Customer ID: ${req.params.id}`,
        );
        console.log(`[SYNC-DEBUG] Status: ${oldCustomer.status} -> ${status}`);
        console.log(`[SYNC-DEBUG] Name: "${oldCustomer.name}" -> "${name}"`);

        // Find the associated customer account
        const customerAccount = await prisma.account.findFirst({
          where: { customerId: req.params.id },
        });

        if (customerAccount) {
          console.log(
            `[SYNC-DEBUG] Found associated account: ${customerAccount.code} ("${customerAccount.name}")`,
          );
          const updateAccountData: any = {};

          // Handle Status synchronization
          if (status !== undefined && oldCustomer.status !== status) {
            updateAccountData.status =
              status === "active" ? "Active" : "Inactive";
          }

          // Handle Name synchronization
          if (name !== undefined && oldCustomer.name !== name) {
            updateAccountData.name = name;
            updateAccountData.description = `Customer Account: ${name}`;
          }

          if (Object.keys(updateAccountData).length > 0) {
            const updatedAcc = await prisma.account.update({
              where: { id: customerAccount.id },
              data: updateAccountData,
            });
            console.log(
              `[SYNC-DEBUG] SUCCESS: Updated account ${updatedAcc.code}. New Name: "${updatedAcc.name}", Status: ${updatedAcc.status}`,
            );
          } else {
            console.log(`[SYNC-DEBUG] No actual changes needed for account.`);
          }
        } else {
          console.warn(
            `[SYNC-DEBUG] WARNING: No account found for customer ID: ${req.params.id}`,
          );
        }
      } catch (err: any) {
        console.error(
          "[SYNC-DEBUG] ERROR synchronizing customer account:",
          err,
        );
      }
    }

    if (newOpeningBalance !== oldOpeningBalance) {
      try {
        console.log(
          `Updating Opening Balance for Customer ${oldCustomer.id}: ${oldOpeningBalance} -> ${newOpeningBalance}`,
        );

        // A. Find and DELETE Old Voucher
        // Broad strict search
        const oldVoucher = await prisma.voucher.findFirst({
          where: {
            AND: [
              { narration: { contains: `(CUST-${oldCustomer.id})` } },
              { narration: { contains: "Opening Balance" } },
            ],
            status: "posted",
          },
          include: { VoucherEntry: true }, // Use VoucherEntry instead of entries,
        });

        // Fallback for Legacy (Name based)
        let voucherToDelete = oldVoucher;
        if (!voucherToDelete) {
          voucherToDelete = await prisma.voucher.findFirst({
            where: {
              narration: {
                startsWith: `Customer Opening Balance: ${oldCustomer.name || ""}`,
              },
              status: "posted",
            },
            include: { VoucherEntry: true }, // Use VoucherEntry instead of entries,
          });
        }

        let customerAccountId: string | null = null;
        let ownerCapitalAccountId: string | null = null;

        if (voucherToDelete) {
          console.log(
            "Found old voucher to delete:",
            voucherToDelete.voucherNumber,
          );

          for (const entry of voucherToDelete.VoucherEntry) {
            // Use VoucherEntry instead of entries
            // Reversal Logic
            if (entry.accountId) {
              await prisma.account.update({
                where: { id: entry.accountId },
                data: {
                  currentBalance: { increment: entry.credit - entry.debit },
                },
              });
            }

            const desc = entry.description || "";
            const name = entry.accountName || "";

            // Check OWNER CAPITAL first (this is the more specific check)
            if (name.includes("OWNER CAPITAL") || name.includes("501003")) {
              ownerCapitalAccountId = entry.accountId;
            } else if (
              oldCustomer.name &&
              (name.includes(oldCustomer.name) ||
                desc.includes(oldCustomer.name))
            ) {
              // Only match customer if we have a non-empty customer name
              customerAccountId = entry.accountId;
            } else if (
              !customerAccountId &&
              entry.accountId !== ownerCapitalAccountId
            ) {
              // Fallback: if not Owner Capital, assume it's the customer account
              customerAccountId = entry.accountId;
            }
          }

          // HARD DELETE
          await prisma.voucherEntry.deleteMany({
            where: { voucherId: voucherToDelete.id },
          });
          await prisma.voucher.delete({ where: { id: voucherToDelete.id } });
        }

        // B. Create New Voucher
        if (newOpeningBalance !== 0) {
          // Find Accounts - Use accountId from payload (most reliable)
          console.log("CustomerAccountId from old voucher:", customerAccountId);
          console.log("AccountId from payload:", accountId);

          // Priority: 1. Payload accountId, 2. Old voucher, 3. FK lookup, 4. Name lookup
          if (!customerAccountId && accountId) {
            customerAccountId = accountId;
            console.log("Using accountId from payload:", customerAccountId);
          }

          if (!customerAccountId) {
            console.log("Looking up account by customerId:", customer.id);
            // Find by customerId FK
            const accountByFk = await prisma.account.findFirst({
              where: { customerId: customer.id },
            });
            console.log("Account found by customerId FK:", accountByFk);
            if (accountByFk) {
              customerAccountId = accountByFk.id;
            } else {
              // Fallback: Find by name (for legacy accounts without FK)
              console.log("Falling back to name lookup...");
              const receivables = await prisma.subgroup.findFirst({
                where: { code: "103" },
              });
              if (receivables) {
                const found = await prisma.account.findFirst({
                  where: {
                    OR: [
                      { name: oldCustomer.name || undefined },
                      { name: customer.name || undefined },
                    ],
                    subgroupId: receivables.id,
                  },
                });
                if (found) customerAccountId = found.id;
              }
            }
          }
          const foundCap = await prisma.account.findFirst({
            where: { code: "501003" },
          });
          if (foundCap) ownerCapitalAccountId = foundCap.id;

          if (customerAccountId && ownerCapitalAccountId) {
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

            // Fetch fresh account details to ensure we have codes
            const custAcc = await prisma.account.findUnique({
              where: { id: customerAccountId },
            });
            const capAcc = await prisma.account.findUnique({
              where: { id: ownerCapitalAccountId },
            });

            if (custAcc && capAcc) {
              // Asset (Cust): Dr if Positive.
              // Equity (Cap): Cr if Positive.
              const entry1 = {
                id: crypto.randomUUID(), // Add required ID
                accountId: customerAccountId,
                accountName: `${custAcc.code}-${custAcc.name}`,
                description: `Customer Opening Balance: ${customer.name} - ${absBalance}`,
                debit: isPositive ? absBalance : 0,
                credit: isPositive ? 0 : absBalance,
                sortOrder: 0,
                customerId: customer.id, // Link entry to customer
              };
              const entry2 = {
                id: crypto.randomUUID(), // Add required ID
                accountId: ownerCapitalAccountId,
                accountName: `${capAcc.code}-${capAcc.name}`,
                description: `Customer Opening Balance: ${customer.name} - ${absBalance}`,
                debit: isPositive ? 0 : absBalance,
                credit: isPositive ? absBalance : 0,
                sortOrder: 1,
                customerId: customer.id, // Link entry to customer
              };

              await prisma.voucher.create({
                data: {
                  id: crypto.randomUUID(), // Add required ID
                  voucherNumber,
                  type: "journal",
                  date: customer.date ? new Date(customer.date) : new Date(),
                  narration: `Customer Opening Balance: ${customer.name} (CUST-${customer.id})`,
                  totalDebit: absBalance,
                  totalCredit: absBalance,
                  status: "posted",
                  createdBy: "System",
                  approvedBy: "System",
                  approvedAt: new Date(),
                  isSystemGenerated: true,
                  updatedAt: new Date(), // Add required updatedAt
                  VoucherEntry: { create: [entry1, entry2] }, // Use VoucherEntry instead of entries
                },
              });

              // Update Balances
              await prisma.account.update({
                where: { id: customerAccountId },
                data: {
                  currentBalance: { increment: entry1.debit - entry1.credit },
                },
              });

              await prisma.account.update({
                where: { id: ownerCapitalAccountId },
                data: {
                  currentBalance: { increment: entry2.credit - entry2.debit },
                },
              });

              if (oldCustomer.name !== customer.name) {
                await prisma.account.update({
                  where: { id: customerAccountId },
                  data: {
                    name: customer.name,
                    description: `Customer Account: ${customer.name}`,
                  },
                });
              }
            }
          } else {
            console.error(
              "Accounts not found for Customer Opening Balance Voucher",
            );
          }
        }
      } catch (err) {
        console.error("Error updating customer opening balance voucher:", err);
      }
    }

    // Add a debug header to response
    res.set("X-Backend-Version", "1.0.2-sync-debug");
    res.json({ data: customer });
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/customers/:id - Delete customer
router.delete("/:id", async (req, res) => {
  try {
    await prisma.customer.delete({
      where: { id: req.params.id },
    });

    res.json({ message: "Customer deleted successfully" });
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;
