import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import * as path from "path";
import prisma from "./config/database";

// Load .env BEFORE any other imports that might use DATABASE_URL
// Load .env based on NODE_ENV
const envFile =
  process.env.NODE_ENV === "production" ? ".env.production" : ".env";
const envPath = path.resolve(__dirname, `../${envFile}`);
dotenv.config({ path: envPath, override: true });

// ============================================================
// DATABASE SAFETY GUARD  ALWAYS USE koncepts_dev
// Never allow any other database to be used.
// This guard overrides stale system/user environment variables.
// ============================================================
const REQUIRED_DB = "koncepts_dev";
const currentDbUrl = process.env.DATABASE_URL || "";

if (!currentDbUrl.includes(REQUIRED_DB)) {
  // Force-override: set it back to the correct DB from .env
  const fs = require("fs");
  const envContent = fs.readFileSync(envPath, "utf-8");
  const match = envContent.match(/DATABASE_URL=([^\r\n]+)/);
  if (match && match[1].includes(REQUIRED_DB)) {
    process.env.DATABASE_URL = match[1].trim();
    console.warn(
      `[SERVER] ??  DATABASE_URL was pointing to wrong DB. Overridden to: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ":****@")}`,
    );
  } else {
    throw new Error(
      `[SERVER] FATAL: Could not find a valid koncepts_dev DATABASE_URL in ${envPath}. Refusing to start.`,
    );
  }
}

if (!process.env.DATABASE_URL?.includes(REQUIRED_DB)) {
  throw new Error(
    `[SERVER] FATAL: DATABASE_URL must point to "${REQUIRED_DB}". Got: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":****@")}. Refusing to start.`,
  );
}

console.log(
  "[SERVER] DATABASE_URL:",
  process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":****@"),
);

// Set timezone to Pakistan (Asia/Karachi)
process.env.TZ = "Asia/Karachi";
import partsRoutes from "./routes/parts";
import dropdownsRoutes from "./routes/dropdowns";
import inventoryRoutes from "./routes/inventory";
import expensesRoutes from "./routes/expenses";
import accountingRoutes from "./routes/accounting";
import financialRoutes from "./routes/financial";
import customersRoutes from "./routes/customers";
import suppliersRoutes from "./routes/suppliers";
import employeesRoutes from "./routes/employees";
import reportsRoutes from "./routes/reports";
import usersRoutes from "./routes/users";
import rolesRoutes from "./routes/roles";
import activityLogsRoutes from "./routes/activity-logs";
import approvalFlowsRoutes from "./routes/approval-flows";
import backupsRoutes from "./routes/backups";
import companyProfileRoutes from "./routes/company-profile";
import whatsappSettingsRoutes from "./routes/whatsapp-settings";
import longcatSettingsRoutes from "./routes/longcat-settings";
import aiAssistantRoutes from "./routes/ai-assistant";
import vouchersRoutes from "./routes/vouchers";
import salesRoutes from "./routes/sales";
import dpoReturnsRoutes from "./routes/dpo-returns";
import salesReturnsRoutes from "./routes/sales-returns";
import stockDetailsRoutes from "./routes/stock-details";
import advancedSearchRoutes from "./routes/advanced-search";
import purchaseImportRoutes from "./routes/purchase-import";
import partsDropdownRoutes from "./routes/parts-dropdown";
import authRoutes from "./routes/auth";
import emailRoutes from "./routes/email";
import { authenticateJWT, authorizeRoles, enforceLoginWindow } from "./middleware/authMiddleware";
import { activityAuditMiddleware } from "./middleware/activityAuditMiddleware";

// Trigger restart for environment variable update + prisma client reload 2026-08-05b
const app = express();
const PORT = process.env.PORT || 5000;
const apiAuth = [authenticateJWT, enforceLoginWindow, activityAuditMiddleware];
const apiAdminAuth = [authenticateJWT, enforceLoginWindow, authorizeRoles("Admin"), activityAuditMiddleware];

// Middleware - CORS configuration
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
  : [
      "http://localhost:5174",
      "http://localhost:8080",
      "http://localhost:8081",
      "http://localhost:83",
    ];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        return callback(null, true);
      }

      // Check explicit allowed origins
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }

      // For development, allow all localhost origins
      if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
        return callback(null, true);
      }

      // In production, allow requests from same origin (when served through Nginx)
      // This allows the frontend served from the same domain to access the API
      const isProduction = process.env.NODE_ENV === "production";
      if (isProduction) {
        // Get server origin from environment or default
        const serverOrigin =
          process.env.SERVER_ORIGIN || "http://155.94.150.168/";
        const serverHost = new URL(serverOrigin).hostname;

        // Extract hostname from origin
        try {
          const originUrl = new URL(origin);
          const originHost = originUrl.hostname;

          // Allow if hostname matches (regardless of protocol http/https)
          if (
            originHost === serverHost ||
            originHost.includes(serverHost) ||
            serverHost.includes(originHost)
          ) {
            return callback(null, true);
          }

          // Also allow if origin contains the server IP
          if (origin.includes("103.60.12.157") || origin.includes(serverHost)) {
            return callback(null, true);
          }
        } catch (e) {
          // If URL parsing fails, try string matching
          if (origin.includes(serverHost) || origin.includes("103.60.12.157")) {
            return callback(null, true);
          }
        }

        // Log CORS rejection for debugging
        return callback(new Error("Not allowed by CORS"));
      }

      // In development, be more permissive
      return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Cache-Control",
      "Pragma",
      "Expires",
    ],
    exposedHeaders: ["Content-Range", "X-Content-Range"],
    maxAge: 86400, // 24 hours
  }),
);
// Middleware to normalize API routes (handle with/without trailing slash without redirecting)
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const logAll =
      process.env.REQUEST_LOG === "all" ||
      process.env.NODE_ENV !== "production";
    if (logAll || res.statusCode >= 400 || duration >= 2000) {
      console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`,
      );
    }
  });

  // Only apply to API routes
  if (req.path.startsWith("/api")) {
    // Normalize path by removing trailing slash (except for root /api)
    if (req.path !== "/api" && req.path.endsWith("/") && req.path.length > 4) {
      req.url =
        req.path.slice(0, -1) +
        (req.url.includes("?") ? req.url.substring(req.path.length) : "");
    }
  }
  next();
});

// Serve uploaded files statically
// This ensures images uploaded to public/uploads are accessible via the backend URL
// (e.g., http://localhost:3001/uploads/parts/image.jpg)
app.use(
  "/uploads",
  express.static(path.join(__dirname, "../../public/uploads")),
);

// Increase body parser limit to handle image uploads (base64 encoded images can be large)
// Base64 encoding increases size by ~33%, so 100mb allows for larger images even after compression
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Inventory ERP Backend API is running" });
});

// Health check (API-prefixed alias for deployment/tests)
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Inventory ERP Backend API is running" });
});

// Public income statement endpoint (completely bypasses authentication)
app.get("/api/public-income-statement", async (req, res) => {
  try {
    const { from_date, to_date } = req.query;

    // Prepare Date Objects with end-of-day fix
    let fromDateObj: Date | undefined;
    let toDateObj: Date | undefined;

    if (from_date) {
      fromDateObj = new Date(from_date as string);
    }
    if (to_date) {
      toDateObj = new Date(to_date as string);
      toDateObj.setHours(23, 59, 59, 999);
    }

    const dateFilter: any = {};
    if (fromDateObj) dateFilter.gte = fromDateObj;
    if (toDateObj) dateFilter.lte = toDateObj;

    // Import prisma
    const prisma = (await import("./config/database")).default;

    // Define common include for accounts
    const commonInclude = {
      VoucherEntry: {
        where: {
          Voucher: {
            status: "posted",
            ...(fromDateObj || toDateObj ? { date: dateFilter } : {}),
          },
        },
      },
    };

    // Query revenue accounts - use MainGroup type "Income"
    const revenueAccounts = await prisma.account.findMany({
      where: {
        Subgroup: {
          MainGroup: {
            type: { in: ["Income", "income", "INCOME", "Revenue", "revenue", "REVENUE"] },
          },
        },
      },
      include: commonInclude,
    });

    // Query cost accounts - use MainGroup name "Cost of Sales"
    const costAccounts = await prisma.account.findMany({
      where: {
        Subgroup: {
          MainGroup: {
            name: { in: ["Cost", "Cost of Sales"] },
          },
        },
      },
      include: commonInclude,
    });

    // Query expense accounts - exclude Cost and Cost of Sales main groups
    const expenseAccounts = await prisma.account.findMany({
      where: {
        Subgroup: {
          MainGroup: {
            type: { in: ["expense", "Expense", "EXPENSE"] },
            name: { notIn: ["Cost", "Cost of Sales"] },
          },
        },
      },
      include: commonInclude,
    });

    // Helper to calculate period movement
    const calculatePeriodAmount = (acc: any, type: "revenue" | "expense") => {
      const totalDebit = acc.VoucherEntry?.reduce(
        (sum: number, entry: any) => sum + (entry.debit || 0),
        0,
      ) || 0;
      const totalCredit = acc.VoucherEntry?.reduce(
        (sum: number, entry: any) => sum + (entry.credit || 0),
        0,
      ) || 0;

      if (type === "revenue") {
        return totalCredit - totalDebit;
      } else {
        return totalDebit - totalCredit;
      }
    };

    // Calculate amounts
    const revenue = revenueAccounts
      .map((acc: any) => ({
        code: acc.code,
        name: acc.name,
        amount: calculatePeriodAmount(acc, "revenue"),
        level: 0,
      }))
      .filter((a: any) => a.amount !== 0);

    const cost = costAccounts
      .map((acc: any) => ({
        code: acc.code,
        name: acc.name,
        amount: calculatePeriodAmount(acc, "expense"),
        level: 0,
      }))
      .filter((a: any) => a.amount !== 0);

    const expenses = expenseAccounts
      .map((acc: any) => ({
        code: acc.code,
        name: acc.name,
        amount: calculatePeriodAmount(acc, "expense"),
        level: 0,
      }))
      .filter((a: any) => a.amount !== 0);

    const totalRevenue = revenue.reduce((sum: number, item: any) => sum + item.amount, 0);
    const totalCost = cost.reduce((sum: number, item: any) => sum + item.amount, 0);
    const totalExpenses = expenses.reduce((sum: number, item: any) => sum + item.amount, 0);

    res.json({
      data: {
        revenue,
        cost,
        expenses,
        summary: {
          totalRevenue,
          totalCost,
          grossProfit: totalRevenue - totalCost,
          totalExpenses,
          netProfit: totalRevenue - totalCost - totalExpenses,
        },
      },
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message || "Failed to fetch income statement" });
  }
});

// Version endpoint for deployment verification
app.get("/api/debug/version", (req, res) => {
  try {
    const fs = require("fs");
    const path = require("path");
    const packagePath = path.join(__dirname, "../package.json");
    let version = "unknown";
    let buildTime = "unknown";

    if (fs.existsSync(packagePath)) {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
      version = packageJson.version || "unknown";
    }

    // Try to get git commit hash
    try {
      const { execSync } = require("child_process");
      const gitHash = execSync("git rev-parse HEAD", {
        cwd: __dirname,
        encoding: "utf8",
      }).trim();
      version = `${version}-${gitHash.substring(0, 7)}`;
    } catch (e) {
      // Git not available, use build time
      buildTime = new Date().toISOString();
    }

    res.json({
      version,
      buildTime: buildTime !== "unknown" ? buildTime : new Date().toISOString(),
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.json({
      version: "unknown",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Debug endpoint to show database info
app.get("/api/debug/db-info", async (req, res) => {
  try {
    const fs = require("fs");
    const dbUrl = process.env.DATABASE_URL || "not set";
    const dbPath = dbUrl.replace("file:", "");
    const fileExists = fs.existsSync(dbPath);

    // Get voucher counts
    const prisma = (await import("./config/database")).default;
    const voucherCount = await prisma.voucher.count();
    const lastVouchers = await prisma.voucher.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: { voucherNumber: true, type: true, date: true },
    });

    res.json({
      cwd: process.cwd(),
      DATABASE_URL: dbUrl,
      sqliteFilePath: dbPath,
      fileExists,
      counts: {
        vouchers: voucherCount,
      },
      lastVouchers: lastVouchers.map((v) => ({
        voucherNumber: v.voucherNumber,
        type: v.type,
        date: v.date,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to check part cost
app.get("/api/debug/part-cost/:partNo", async (req, res) => {
  try {
    const { partNo } = req.params;
    const prisma = (await import("./config/database")).default;
    const { getCanonicalPartId } = await import("./services/partCanonical");

    // Get DATABASE_URL (masked)
    const dbUrl = process.env.DATABASE_URL || "not set";
    const maskedDbUrl = dbUrl.includes("file:")
      ? `file:${dbUrl.split("/").pop()}`
      : dbUrl.replace(/:[^:@]+@/, ":****@");

    // Get ALL parts with this partNo
    const allParts = await prisma.part.findMany({
      where: { partNo },
      select: {
        id: true,
        partNo: true,
        cost: true,
        costSource: true,
        costSourceRef: true,
        costUpdatedAt: true,
        updatedAt: true,
        createdAt: true,
      },
      orderBy: [
        { costUpdatedAt: "desc" },
        { updatedAt: "desc" },
        { createdAt: "asc" },
      ],
    });

    if (!allParts || allParts.length === 0) {
      return res.status(404).json({
        error: `Part ${partNo} not found`,
        databaseUrlMasked: maskedDbUrl,
        allParts: [],
        canonicalPartId: null,
        pricingApiWillReturn: null,
      });
    }

    // Get canonical part ID using service
    const canonicalPartId = await getCanonicalPartId(prisma, partNo);

    // The exact row that Pricing API would return (canonical part)
    const pricingApiWillReturn =
      allParts.find((p) => p.id === canonicalPartId) || allParts[0];

    res.json({
      requestedPartNo: partNo,
      databaseUrlMasked: maskedDbUrl,
      allParts: allParts.map((part) => ({
        id: part.id,
        partNo: part.partNo,
        cost: part.cost,
        costSource: part.costSource,
        costSourceRef: part.costSourceRef,
        costUpdatedAt: part.costUpdatedAt,
        updatedAt: part.updatedAt,
        createdAt: part.createdAt,
        isCanonical: part.id === canonicalPartId,
      })),
      canonicalPartId,
      pricingApiWillReturn: {
        id: pricingApiWillReturn.id,
        partNo: pricingApiWillReturn.partNo,
        cost: pricingApiWillReturn.cost,
        costSource: pricingApiWillReturn.costSource,
        costSourceRef: pricingApiWillReturn.costSourceRef,
        costUpdatedAt: pricingApiWillReturn.costUpdatedAt,
        updatedAt: pricingApiWillReturn.updatedAt,
        createdAt: pricingApiWillReturn.createdAt,
        note: "This is the exact row that /api/parts and /api/parts/price-management will return (canonical part)",
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API Routes
app.use("/api/auth", authRoutes); // Login route (public)
// Temporary public endpoint for testing adjustment parts
app.get("/api/inventory/adjustment-parts", async (req, res) => {
  try {
    console.log("Fetching parts that are in adjustments (public endpoint)");
    
    // Get unique part IDs from all AdjustmentItem records
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    
    const adjustmentItems = await prisma.adjustmentItem.findMany({
      where: {
        Adjustment: {
          deletedAt: null,
        },
      },
      select: {
        partId: true,
      },
      distinct: ['partId'],
    });

    const partIds = adjustmentItems.map((item: any) => item.partId);
    console.log(`Found ${partIds.length} unique parts in adjustments`);

    // Now fetch the full part details for these IDs
    const parts = await prisma.part.findMany({
      where: {
        id: {
          in: partIds,
        },
      },
      include: {
        Brand: true,
      },
      orderBy: {
        partNo: 'asc',
      },
    });

    const result = parts.map((part: any) => ({
      id: part.id,
      partNo: part.partNo,
      brand: part.Brand?.name || '',
      description: part.description,
    }));

    console.log(`Returning ${result.length} parts for dropdown`);
    res.json({ data: result });
  } catch (error: any) {
    console.error("Error fetching adjustment parts:", error);
    res.status(500).json({ error: error.message });
  }
});

app.use("/api/parts", ...apiAuth, partsRoutes);
app.use("/api/dropdowns", ...apiAuth, dropdownsRoutes);
app.use("/api/inventory", ...apiAuth, inventoryRoutes);
app.use("/api/expenses", ...apiAuth, expensesRoutes);
app.use("/api/accounting", ...apiAuth, accountingRoutes);
app.use("/api/financial", financialRoutes); // Temporarily disabled auth for testing
app.use("/api/public-financial", financialRoutes); // Public route for testing
app.use("/api/customers", ...apiAuth, customersRoutes);
app.use("/api/suppliers", ...apiAuth, suppliersRoutes);
app.use("/api/employees", ...apiAuth, employeesRoutes);
app.use("/api/reports", ...apiAuth, reportsRoutes);
app.use("/api/users", ...apiAdminAuth, usersRoutes);
app.use("/api/roles", ...apiAuth, rolesRoutes);
app.use("/api/activity-logs", ...apiAuth, activityLogsRoutes);
app.use("/api/approval-flows", ...apiAuth, approvalFlowsRoutes);
app.use("/api/backups", ...apiAuth, backupsRoutes);
app.use("/api/company-profile", ...apiAuth, companyProfileRoutes);
app.use("/api/whatsapp-settings", ...apiAuth, whatsappSettingsRoutes);
app.use("/api/longcat-settings", ...apiAuth, longcatSettingsRoutes);
app.use("/api/ai-assistant", ...apiAuth, aiAssistantRoutes);
app.use("/api/vouchers", ...apiAuth, vouchersRoutes);
// Legacy/compat alias (some clients call this path directly)
app.use("/api/getVouchers", ...apiAuth, vouchersRoutes);
app.use("/api/sales", ...apiAuth, salesRoutes);
app.use("/api/sales-returns", ...apiAuth, salesReturnsRoutes);
app.use("/api/parts-dropdown", ...apiAuth, partsDropdownRoutes);
app.use("/api/dpo-returns", ...apiAuth, dpoReturnsRoutes);
app.use("/api/sales-returns", ...apiAuth, salesReturnsRoutes);
app.use("/api/stock-details", ...apiAuth, stockDetailsRoutes);
app.use("/api/advanced-search", ...apiAuth, advancedSearchRoutes);
app.use("/api/advanced-search", ...apiAuth, advancedSearchRoutes);
app.use("/api/purchase-import", ...apiAuth, purchaseImportRoutes);
app.use("/api/email", ...apiAuth, emailRoutes);

// Dev-Koncepts deployment: all API under /dev-koncepts/api when frontend is at /dev-koncepts/ (so requests hit this backend, not main app)
app.use("/dev-koncepts/api/parts", ...apiAuth, partsRoutes);
app.use("/dev-koncepts/api/dropdowns", ...apiAuth, dropdownsRoutes);
app.use("/dev-koncepts/api/inventory", ...apiAuth, inventoryRoutes);
app.use("/dev-koncepts/api/expenses", ...apiAuth, expensesRoutes);
app.use("/dev-koncepts/api/accounting", ...apiAuth, accountingRoutes);
app.use("/dev-koncepts/api/financial", ...apiAuth, financialRoutes);
app.use("/dev-koncepts/api/customers", ...apiAuth, customersRoutes);
app.use("/dev-koncepts/api/suppliers", ...apiAuth, suppliersRoutes);
app.use("/dev-koncepts/api/employees", ...apiAuth, employeesRoutes);
app.use("/dev-koncepts/api/reports", ...apiAuth, reportsRoutes);
app.use("/dev-koncepts/api/users", ...apiAdminAuth, usersRoutes);
app.use("/dev-koncepts/api/roles", ...apiAuth, rolesRoutes);
app.use("/dev-koncepts/api/activity-logs", ...apiAuth, activityLogsRoutes);
app.use("/dev-koncepts/api/approval-flows", ...apiAuth, approvalFlowsRoutes);
app.use("/dev-koncepts/api/backups", ...apiAuth, backupsRoutes);
app.use("/dev-koncepts/api/company-profile", ...apiAuth, companyProfileRoutes);
app.use("/dev-koncepts/api/whatsapp-settings", ...apiAuth, whatsappSettingsRoutes);
app.use("/dev-koncepts/api/longcat-settings", ...apiAuth, longcatSettingsRoutes);
app.use("/dev-koncepts/api/ai-assistant", ...apiAuth, aiAssistantRoutes);
app.use("/dev-koncepts/api/vouchers", ...apiAuth, vouchersRoutes);
app.use("/dev-koncepts/api/getVouchers", ...apiAuth, vouchersRoutes);
app.use("/dev-koncepts/api/sales", ...apiAuth, salesRoutes);
app.use("/dev-koncepts/api/dpo-returns", ...apiAuth, dpoReturnsRoutes);
app.use("/dev-koncepts/api/sales-returns", ...apiAuth, salesReturnsRoutes);
app.use("/dev-koncepts/api/advanced-search", ...apiAuth, advancedSearchRoutes);
app.use("/dev-koncepts/api/purchase-import", ...apiAuth, purchaseImportRoutes);
app.use("/dev-koncepts/api/email", ...apiAuth, emailRoutes);

// RESTART TRIGGER - EXPLICIT FORCE AT 2026-02-03 18:22
console.log(
  "[SERVER] Registering all API routes including /api/inventory/rack-shelf-balances... REBOOT TRIGGER 2026-02-13 15:09 - FIX APPROVAL ITERABLE ERROR",
);

// Error handling middleware
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    res
      .status(500)
      .json({ error: "Internal server error", message: err.message });
  },
);

// Start server
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(
    `Balance Sheet endpoint: http://localhost:${PORT}/api/accounting/balance-sheet`,
  );
});
