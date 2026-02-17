import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getApiBaseUrl } from "@/lib/api";
import {
  BookOpen,
  Code2,
  Database,
  Server,
  Globe,
  ChevronRight,
  FileJson,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navSections = [
  { id: "overview", label: "Overview", icon: BookOpen },
  { id: "frontend", label: "Frontend", icon: Globe },
  { id: "backend", label: "Backend", icon: Server },
  { id: "database", label: "Database", icon: Database },
  { id: "backend-api", label: "Backend API", icon: FileJson },
  { id: "frontend-api", label: "Frontend API", icon: Code2 },
  { id: "environment", label: "Environment & Deployment", icon: Layers },
] as const;

const DocSection = ({
  id,
  title,
  description,
  children,
  icon: Icon,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  icon?: React.ElementType;
}) => (
  <section id={id} className="scroll-mt-8">
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xl">
          {Icon && <Icon className="h-5 w-5 text-muted-foreground" />}
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  </section>
);

const Endpoint = ({ method, path }: { method: string; path: string }) => (
  <div className="font-mono text-sm flex items-center gap-2 flex-wrap">
    <span
      className={cn(
        "px-1.5 py-0.5 rounded font-semibold",
        method === "GET" && "bg-blue-500/15 text-blue-600 dark:text-blue-400",
        method === "POST" && "bg-green-500/15 text-green-600 dark:text-green-400",
        method === "PUT" && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
        method === "PATCH" && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
        method === "DELETE" && "bg-red-500/15 text-red-600 dark:text-red-400"
      )}
    >
      {method}
    </span>
    <span className="text-muted-foreground break-all">{path}</span>
  </div>
);

const Documentation = () => {
  const apiBase = getApiBaseUrl();
  const base = "/dev-koncepts";

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col ml-16">
        <Header />
        <main className="flex-1 overflow-auto">
          <div className="flex min-h-full">
            <aside className="w-56 shrink-0 border-r border-border p-4 hidden lg:block">
              <nav className="sticky top-24 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  On this page
                </p>
                {navSections.map(({ id, label, icon: Icon }) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    className="flex items-center gap-2 py-1.5 px-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {label}
                  </a>
                ))}
              </nav>
            </aside>

            <div className="flex-1 min-w-0">
            <div className="p-6 max-w-4xl space-y-8 pb-24">
              <div>
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                  <BookOpen className="h-8 w-8 text-primary" />
                  Developer Documentation
                </h1>
                <p className="text-muted-foreground mt-1">
                  Complete reference for the Inventory ERP (Dev-Koncepts) app: frontend, backend, database, and APIs.
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Access this page at{" "}
                  <a href={`${base}/docs`} className="text-primary hover:underline font-mono">
                    {base}/docs
                  </a>
                  {" or "}
                  <a href={`${base}/documentation`} className="text-primary hover:underline font-mono">
                    {base}/documentation
                  </a>
                </p>
              </div>

              <DocSection
                id="overview"
                title="Overview"
                description="Tech stack and high-level architecture"
                icon={BookOpen}
              >
                <p>
                  <strong>Dev-Koncepts</strong> is an Inventory ERP with parts management, inventory, sales, expenses,
                  accounting, vouchers, and financial statements. The app runs as a React SPA (Vite) with an Express
                  backend and SQLite (Prisma).
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li>Frontend: React 18, TypeScript, Vite, TanStack Query, Tailwind, shadcn/ui</li>
                  <li>Backend: Node.js, Express, Prisma, SQLite</li>
                  <li>API: REST over JSON; base under <code className="bg-muted px-1 rounded">/api</code> or{" "}
                    <code className="bg-muted px-1 rounded">/dev-koncepts/api</code>
                  </li>
                </ul>
              </DocSection>

              <DocSection
                id="frontend"
                title="Frontend"
                description="Structure, routes, and tech stack"
                icon={Globe}
              >
                <div>
                  <h4 className="font-semibold mb-2">Structure</h4>
                  <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto font-mono">
{`src/
├── main.tsx, App.tsx, index.css
├── pages/          # Route-level pages
├── components/     # Reusable UI + feature components
├── hooks/          # useDashboardData, useInventoryData, useAppNotifications, etc.
├── lib/            # api.ts (API client), api-utils, utils
├── contexts/       # NotificationContext
├── types/          # API extensions, invoice, global
└── utils/          # auth, dateUtils, exportUtils, imageCompression, etc.`}
                  </pre>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Routes (URLs)</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Base path: <code className="bg-muted px-1 rounded">{base}</code>. All except <code className="bg-muted px-1 rounded">/login</code> require auth.
                  </p>
                  <ul className="space-y-1.5 text-sm font-mono">
                    <li><code>/</code> — Dashboard</li>
                    <li><code>/login</code> — Login</li>
                    <li><code>/docs</code> — This documentation</li>
                    <li><code>/partentry</code>, <code>/partentry/itemslist</code>, <code>/partentry/attributes</code>, <code>/partentry/models</code></li>
                    <li><code>/inventory</code>, <code>/inventory/:tab</code></li>
                    <li><code>/store</code>, <code>/store/:tab</code></li>
                    <li><code>/pricing-costing</code></li>
                    <li><code>/sales</code>, <code>/sales/:tab</code></li>
                    <li><code>/manage</code>, <code>/manage/:tab</code> — Customers & suppliers</li>
                    <li><code>/reports</code></li>
                    <li><code>/expenses</code></li>
                    <li><code>/accounting</code></li>
                    <li><code>/financial-statements</code></li>
                    <li><code>/vouchers</code></li>
                    <li><code>/settings</code>, <code>/settings/:tab</code></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Key dependencies</h4>
                  <p className="text-sm text-muted-foreground">
                    React, React Router, TanStack Query, Tailwind CSS, Radix UI (via shadcn), Recharts, react-hook-form,
                    Zod, date-fns, Lucide icons. Build: Vite (base <code className="bg-muted px-1 rounded">/dev-koncepts/</code>).
                  </p>
                </div>
              </DocSection>

              <DocSection
                id="backend"
                title="Backend"
                description="Express server, routes, and config"
                icon={Server}
              >
                <div>
                  <h4 className="font-semibold mb-2">Structure</h4>
                  <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto font-mono">
{`backend/
├── src/
│   ├── server.ts       # Express app, CORS, route mounting
│   ├── config/         # database (Prisma client)
│   ├── routes/         # API route modules
│   ├── services/       # e.g. partCanonical
│   └── utils/          # activityLogger, inventoryFormulas, etc.
├── prisma/
│   ├── schema.prisma   # Data model
│   ├── migrations/
│   └── dev-koncepts.db # SQLite DB (dev)
└── package.json`}
                  </pre>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Route modules</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Mounted under <code className="bg-muted px-1 rounded">/api</code> and <code className="bg-muted px-1 rounded">/dev-koncepts/api</code>.
                  </p>
                  <ul className="space-y-1 text-sm font-mono">
                    <li>parts, dropdowns, inventory, expenses, accounting, financial</li>
                    <li>customers, suppliers, reports, users, roles</li>
                    <li>activity-logs, approval-flows, backups, company-profile</li>
                    <li>whatsapp-settings, longcat-settings, kits, vouchers</li>
                    <li>sales, dpo-returns, sales-returns, advanced-search</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Extra endpoints</h4>
                  <ul className="space-y-1 text-sm">
                    <li><code>GET /health</code>, <code>GET /api/health</code> — Health check</li>
                    <li><code>GET /api/debug/version</code> — Version / build info</li>
                    <li><code>GET /api/debug/db-info</code> — DB path, voucher counts</li>
                    <li><code>GET /api/debug/part-cost/:partNo</code> — Part cost debug</li>
                  </ul>
                </div>
              </DocSection>

              <DocSection
                id="database"
                title="Database"
                description="Prisma schema and main models"
                icon={Database}
              >
                <p className="text-sm text-muted-foreground">
                  SQLite via Prisma. <code className="bg-muted px-1 rounded">DATABASE_URL</code> points to{" "}
                  <code className="bg-muted px-1 rounded">file:./prisma/dev-koncepts.db</code> (or equivalent).
                </p>
                <div>
                  <h4 className="font-semibold mb-2">Main models</h4>
                  <ul className="grid gap-2 text-sm">
                    <li><strong>Parts & catalog:</strong> MasterPart, Brand, Category, Subcategory, Application, Part, Model</li>
                    <li><strong>Inventory:</strong> Store, Rack, Shelf, StockMovement, Transfer, TransferItem, StockVerification, StockVerificationItem</li>
                    <li><strong>Adjustments:</strong> Adjustment, AdjustmentItem</li>
                    <li><strong>Purchasing:</strong> PurchaseOrder, PurchaseOrderItem; DirectPurchaseOrder, DirectPurchaseOrderItem, DirectPurchaseOrderExpense, DirectPurchaseOrderReturn, DirectPurchaseOrderReturnItem</li>
                    <li><strong>Sales:</strong> SalesInquiry, SalesInquiryItem; SalesQuotation, SalesQuotationItem; SalesInvoice, SalesInvoiceItem; StockReservation; DeliveryLog, DeliveryLogItem; SalesReturn, SalesReturnItem; Receivable</li>
                    <li><strong>Accounting:</strong> MainGroup, Subgroup, Account; JournalEntry, JournalLine; Voucher, VoucherEntry</li>
                    <li><strong>Expenses:</strong> ExpenseType, PostedExpense, OperationalExpense</li>
                    <li><strong>Part pricing:</strong> PriceHistory</li>
                    <li><strong>Master data:</strong> Customer, Supplier; User, Role</li>
                    <li><strong>Kits:</strong> Kit, KitItem</li>
                    <li><strong>System:</strong> ActivityLog, ApprovalFlow, Backup, BackupSchedule, CompanyProfile, WhatsAppSettings, LongCatSettings</li>
                  </ul>
                </div>
                <p className="text-sm text-muted-foreground">
                  Run <code className="bg-muted px-1 rounded">npx prisma migrate deploy</code> in production to apply migrations.
                </p>
              </DocSection>

              <DocSection
                id="backend-api"
                title="Backend API"
                description="REST endpoints by module"
                icon={FileJson}
              >
                <p className="text-sm text-muted-foreground mb-4">
                  Base: <code className="bg-muted px-1 rounded font-mono break-all">{apiBase}</code>. All below are relative to that base.
                </p>

                <div className="space-y-6">
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-1"><ChevronRight className="h-4 w-4" /> /parts</h4>
                    <div className="space-y-1.5 pl-4">
                      <Endpoint method="GET" path="/parts" />
                      <Endpoint method="GET" path="/parts/price-management" />
                      <Endpoint method="POST" path="/parts/bulk-update-prices" />
                      <Endpoint method="GET" path="/parts/price-history" />
                      <Endpoint method="GET" path="/parts/:id" />
                      <Endpoint method="POST" path="/parts" />
                      <Endpoint method="PUT" path="/parts/:id" />
                      <Endpoint method="PUT" path="/parts/:id/prices" />
                      <Endpoint method="DELETE" path="/parts/:id" />
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-1"><ChevronRight className="h-4 w-4" /> /dropdowns</h4>
                    <div className="space-y-1.5 pl-4">
                      <Endpoint method="GET" path="/dropdowns/master-parts" />
                      <Endpoint method="GET" path="/dropdowns/brands" />
                      <Endpoint method="GET" path="/dropdowns/categories" />
                      <Endpoint method="GET" path="/dropdowns/subcategories" />
                      <Endpoint method="GET" path="/dropdowns/applications" />
                      <Endpoint method="GET" path="/dropdowns/applications/all" />
                      <Endpoint method="POST" path="/dropdowns/applications" />
                      <Endpoint method="PUT" path="/dropdowns/applications/:id" />
                      <Endpoint method="DELETE" path="/dropdowns/applications/:id" />
                      <Endpoint method="POST" path="/dropdowns/applications/remove-duplicates" />
                      <Endpoint method="GET" path="/dropdowns/parts" />
                      <Endpoint method="GET" path="/dropdowns/categories/all" />
                      <Endpoint method="POST" path="/dropdowns/categories" />
                      <Endpoint method="PUT" path="/dropdowns/categories/:id" />
                      <Endpoint method="DELETE" path="/dropdowns/categories/:id" />
                      <Endpoint method="GET" path="/dropdowns/subcategories/all" />
                      <Endpoint method="POST" path="/dropdowns/subcategories" />
                      <Endpoint method="PUT" path="/dropdowns/subcategories/:id" />
                      <Endpoint method="DELETE" path="/dropdowns/subcategories/:id" />
                      <Endpoint method="GET" path="/dropdowns/brands/all" />
                      <Endpoint method="POST" path="/dropdowns/brands" />
                      <Endpoint method="PUT" path="/dropdowns/brands/:id" />
                      <Endpoint method="DELETE" path="/dropdowns/brands/:id" />
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-1"><ChevronRight className="h-4 w-4" /> /inventory</h4>
                    <div className="space-y-1.5 pl-4">
                      <Endpoint method="GET" path="/inventory/dashboard" />
                      <Endpoint method="GET" path="/inventory/movements" />
                      <Endpoint method="POST" path="/inventory/movements" />
                      <Endpoint method="GET" path="/inventory/balance/:partId" />
                      <Endpoint method="GET" path="/inventory/balances" />
                      <Endpoint method="GET" path="/inventory/stock-analysis" />
                      <Endpoint method="GET" path="/inventory/stock-balance-valuation" />
                      <Endpoint method="GET" path="/inventory/transfers" />
                      <Endpoint method="POST" path="/inventory/transfers" />
                      <Endpoint method="GET" path="/inventory/transfers/:id" />
                      <Endpoint method="PUT" path="/inventory/transfers/:id" />
                      <Endpoint method="DELETE" path="/inventory/transfers/:id" />
                      <Endpoint method="GET" path="/inventory/adjustments" />
                      <Endpoint method="POST" path="/inventory/adjustments" />
                      <Endpoint method="GET" path="/inventory/adjustments/by-store" />
                      <Endpoint method="GET" path="/inventory/adjustments/:id" />
                      <Endpoint method="PUT" path="/inventory/adjustments/:id" />
                      <Endpoint method="PUT" path="/inventory/adjustments/:id/approve" />
                      <Endpoint method="DELETE" path="/inventory/adjustments/:id" />
                      <Endpoint method="GET" path="/inventory/purchase-orders" />
                      <Endpoint method="GET" path="/inventory/purchase-orders/by-part/:partId" />
                      <Endpoint method="POST" path="/inventory/purchase-orders" />
                      <Endpoint method="GET" path="/inventory/purchase-orders/:id" />
                      <Endpoint method="PUT" path="/inventory/purchase-orders/:id" />
                      <Endpoint method="DELETE" path="/inventory/purchase-orders/:id" />
                      <Endpoint method="GET" path="/inventory/stores" />
                      <Endpoint method="POST" path="/inventory/stores" />
                      <Endpoint method="PUT" path="/inventory/stores/:id" />
                      <Endpoint method="DELETE" path="/inventory/stores/:id" />
                      <Endpoint method="GET" path="/inventory/racks" />
                      <Endpoint method="POST" path="/inventory/racks" />
                      <Endpoint method="PUT" path="/inventory/racks/:id" />
                      <Endpoint method="DELETE" path="/inventory/racks/:id" />
                      <Endpoint method="GET" path="/inventory/shelves" />
                      <Endpoint method="POST" path="/inventory/shelves" />
                      <Endpoint method="PUT" path="/inventory/shelves/:id" />
                      <Endpoint method="DELETE" path="/inventory/shelves/:id" />
                      <Endpoint method="GET" path="/inventory/multi-dimensional-report" />
                      <Endpoint method="GET" path="/inventory/verifications" />
                      <Endpoint method="GET" path="/inventory/verifications/active" />
                      <Endpoint method="POST" path="/inventory/verifications" />
                      <Endpoint method="GET" path="/inventory/verifications/:id" />
                      <Endpoint method="PUT" path="/inventory/verifications/:id/items/:itemId" />
                      <Endpoint method="PUT" path="/inventory/verifications/:id/complete" />
                      <Endpoint method="PUT" path="/inventory/verifications/:id/cancel" />
                      <Endpoint method="GET" path="/inventory/direct-purchase-orders" />
                      <Endpoint method="GET" path="/inventory/direct-purchase-orders/:id" />
                      <Endpoint method="POST" path="/inventory/direct-purchase-orders" />
                      <Endpoint method="PUT" path="/inventory/direct-purchase-orders/:id" />
                      <Endpoint method="POST" path="/inventory/direct-purchase-orders/:dpoId/payment" />
                      <Endpoint method="DELETE" path="/inventory/direct-purchase-orders/:id" />
                      <Endpoint method="POST" path="/inventory/stock/reserve" />
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-1"><ChevronRight className="h-4 w-4" /> /expenses</h4>
                    <div className="space-y-1.5 pl-4">
                      <Endpoint method="GET" path="/expenses/expense-types" />
                      <Endpoint method="POST" path="/expenses/expense-types" />
                      <Endpoint method="PUT" path="/expenses/expense-types/:id" />
                      <Endpoint method="DELETE" path="/expenses/expense-types/:id" />
                      <Endpoint method="GET" path="/expenses/posted-expenses" />
                      <Endpoint method="POST" path="/expenses/posted-expenses" />
                      <Endpoint method="GET" path="/expenses/operational-expenses" />
                      <Endpoint method="POST" path="/expenses/operational-expenses" />
                      <Endpoint method="GET" path="/expenses/operational-expenses/:id" />
                      <Endpoint method="GET" path="/expenses/statistics" />
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-1"><ChevronRight className="h-4 w-4" /> /accounting</h4>
                    <div className="space-y-1.5 pl-4">
                      <Endpoint method="GET" path="/accounting/main-groups" />
                      <Endpoint method="POST" path="/accounting/main-groups" />
                      <Endpoint method="PUT" path="/accounting/main-groups/:id" />
                      <Endpoint method="DELETE" path="/accounting/main-groups/:id" />
                      <Endpoint method="POST" path="/accounting/seed-main-groups" />
                      <Endpoint method="POST" path="/accounting/seed-subgroups" />
                      <Endpoint method="POST" path="/accounting/seed-required-accounts" />
                      <Endpoint method="GET" path="/accounting/subgroups" />
                      <Endpoint method="POST" path="/accounting/subgroups" />
                      <Endpoint method="PUT" path="/accounting/subgroups/:id" />
                      <Endpoint method="DELETE" path="/accounting/subgroups/:id" />
                      <Endpoint method="GET" path="/accounting/accounts" />
                      <Endpoint method="POST" path="/accounting/accounts" />
                      <Endpoint method="PUT" path="/accounting/accounts/:id" />
                      <Endpoint method="DELETE" path="/accounting/accounts/:id" />
                      <Endpoint method="GET" path="/accounting/journal-entries" />
                      <Endpoint method="POST" path="/accounting/journal-entries" />
                      <Endpoint method="POST" path="/accounting/journal-entries/:id/post" />
                      <Endpoint method="GET" path="/accounting/general-journal" />
                      <Endpoint method="GET" path="/accounting/general-ledger" />
                      <Endpoint method="GET" path="/accounting/trial-balance" />
                      <Endpoint method="GET" path="/accounting/income-statement" />
                      <Endpoint method="POST" path="/accounting/recalculate-balances" />
                      <Endpoint method="GET" path="/accounting/balance-sheet" />
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-1"><ChevronRight className="h-4 w-4" /> /financial</h4>
                    <div className="space-y-1.5 pl-4">
                      <Endpoint method="GET" path="/financial/general-journal" />
                      <Endpoint method="GET" path="/financial/trial-balance" />
                      <Endpoint method="GET" path="/financial/income-statement" />
                      <Endpoint method="GET" path="/financial/ledgers" />
                      <Endpoint method="GET" path="/financial/account-groups" />
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-1"><ChevronRight className="h-4 w-4" /> /customers, /suppliers</h4>
                    <div className="space-y-1.5 pl-4">
                      <Endpoint method="GET" path="/customers" />
                      <Endpoint method="GET" path="/customers/:id" />
                      <Endpoint method="POST" path="/customers" />
                      <Endpoint method="PUT" path="/customers/:id" />
                      <Endpoint method="DELETE" path="/customers/:id" />
                      <Endpoint method="GET" path="/suppliers" />
                      <Endpoint method="GET" path="/suppliers/:id" />
                      <Endpoint method="POST" path="/suppliers" />
                      <Endpoint method="PUT" path="/suppliers/:id" />
                      <Endpoint method="DELETE" path="/suppliers/:id" />
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-1"><ChevronRight className="h-4 w-4" /> /reports</h4>
                    <div className="space-y-1.5 pl-4">
                      <Endpoint method="GET" path="/reports/dashboard/metrics" />
                      <Endpoint method="GET" path="/reports/dashboard/hourly-sales" />
                      <Endpoint method="GET" path="/reports/dashboard/top-selling" />
                      <Endpoint method="GET" path="/reports/dashboard/recent-activity" />
                      <Endpoint method="GET" path="/reports/sales" />
                      <Endpoint method="GET" path="/reports/sales/periodic" />
                      <Endpoint method="GET" path="/reports/sales/by-type" />
                      <Endpoint method="GET" path="/reports/sales/target-achievement" />
                      <Endpoint method="GET" path="/reports/inventory/stock-movement" />
                      <Endpoint method="GET" path="/reports/inventory/brand-wise" />
                      <Endpoint method="GET" path="/reports/financial/purchases" />
                      <Endpoint method="GET" path="/reports/financial/purchase-comparison" />
                      <Endpoint method="GET" path="/reports/financial/import-cost" />
                      <Endpoint method="GET" path="/reports/financial/expenses" />
                      <Endpoint method="GET" path="/reports/analytics/customers" />
                      <Endpoint method="GET" path="/reports/analytics/customer-aging" />
                      <Endpoint method="GET" path="/reports/analytics/supplier-performance" />
                      <Endpoint method="GET" path="/reports/trial-balance" />
                      <Endpoint method="GET" path="/reports/income-statement" />
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-1"><ChevronRight className="h-4 w-4" /> /users, /roles</h4>
                    <div className="space-y-1.5 pl-4">
                      <Endpoint method="GET" path="/users" />
                      <Endpoint method="GET" path="/users/:id" />
                      <Endpoint method="POST" path="/users" />
                      <Endpoint method="PUT" path="/users/:id" />
                      <Endpoint method="DELETE" path="/users/:id" />
                      <Endpoint method="GET" path="/roles" />
                      <Endpoint method="GET" path="/roles/:id" />
                      <Endpoint method="POST" path="/roles" />
                      <Endpoint method="PUT" path="/roles/:id" />
                      <Endpoint method="DELETE" path="/roles/:id" />
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-1"><ChevronRight className="h-4 w-4" /> /activity-logs, /approval-flows, /backups, /company-profile</h4>
                    <div className="space-y-1.5 pl-4">
                      <Endpoint method="GET" path="/activity-logs" />
                      <Endpoint method="GET" path="/approval-flows" />
                      <Endpoint method="GET" path="/approval-flows/:id" />
                      <Endpoint method="POST" path="/approval-flows" />
                      <Endpoint method="PUT" path="/approval-flows/:id" />
                      <Endpoint method="DELETE" path="/approval-flows/:id" />
                      <Endpoint method="GET" path="/backups" />
                      <Endpoint method="GET" path="/backups/:id" />
                      <Endpoint method="POST" path="/backups" />
                      <Endpoint method="POST" path="/backups/:id/restore" />
                      <Endpoint method="GET" path="/backups/:id/download" />
                      <Endpoint method="DELETE" path="/backups/:id" />
                      <Endpoint method="GET" path="/company-profile" />
                      <Endpoint method="PUT" path="/company-profile" />
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-1"><ChevronRight className="h-4 w-4" /> /whatsapp-settings, /longcat-settings</h4>
                    <div className="space-y-1.5 pl-4">
                      <Endpoint method="GET" path="/whatsapp-settings" />
                      <Endpoint method="PUT" path="/whatsapp-settings" />
                      <Endpoint method="POST" path="/whatsapp-settings/send-message" />
                      <Endpoint method="GET" path="/longcat-settings" />
                      <Endpoint method="PUT" path="/longcat-settings" />
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-1"><ChevronRight className="h-4 w-4" /> /kits, /vouchers</h4>
                    <div className="space-y-1.5 pl-4">
                      <Endpoint method="GET" path="/kits" />
                      <Endpoint method="GET" path="/kits/:id" />
                      <Endpoint method="POST" path="/kits" />
                      <Endpoint method="PUT" path="/kits/:id" />
                      <Endpoint method="DELETE" path="/kits/:id" />
                      <Endpoint method="GET" path="/vouchers" />
                      <Endpoint method="GET" path="/vouchers/:id" />
                      <Endpoint method="POST" path="/vouchers" />
                      <Endpoint method="PUT" path="/vouchers/:id" />
                      <Endpoint method="DELETE" path="/vouchers/:id" />
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-1"><ChevronRight className="h-4 w-4" /> /sales</h4>
                    <div className="space-y-1.5 pl-4">
                      <Endpoint method="GET" path="/sales/inquiries" />
                      <Endpoint method="GET" path="/sales/inquiries/:id" />
                      <Endpoint method="POST" path="/sales/inquiries" />
                      <Endpoint method="PUT" path="/sales/inquiries/:id" />
                      <Endpoint method="DELETE" path="/sales/inquiries/:id" />
                      <Endpoint method="POST" path="/sales/inquiries/:id/convert-to-quotation" />
                      <Endpoint method="GET" path="/sales/quotations" />
                      <Endpoint method="GET" path="/sales/quotations/:id" />
                      <Endpoint method="POST" path="/sales/quotations" />
                      <Endpoint method="PUT" path="/sales/quotations/:id" />
                      <Endpoint method="DELETE" path="/sales/quotations/:id" />
                      <Endpoint method="POST" path="/sales/quotations/:id/convert-to-invoice" />
                      <Endpoint method="GET" path="/sales/invoices" />
                      <Endpoint method="GET" path="/sales/invoices/:id" />
                      <Endpoint method="GET" path="/sales/invoices/by-part/:partId" />
                      <Endpoint method="POST" path="/sales/invoices" />
                      <Endpoint method="PUT" path="/sales/invoices/:id" />
                      <Endpoint method="POST" path="/sales/invoices/:id/approve" />
                      <Endpoint method="POST" path="/sales/invoices/:id/delivery" />
                      <Endpoint method="POST" path="/sales/invoices/:id/payment" />
                      <Endpoint method="POST" path="/sales/invoices/:id/hold" />
                      <Endpoint method="POST" path="/sales/invoices/:id/release-hold" />
                      <Endpoint method="PUT" path="/sales/invoices/:id/status" />
                      <Endpoint method="POST" path="/sales/invoices/:id/cancel" />
                      <Endpoint method="DELETE" path="/sales/invoices/:id" />
                      <Endpoint method="GET" path="/sales/stock/reserved/:partId" />
                      <Endpoint method="GET" path="/sales/stock/available/:partId" />
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-1"><ChevronRight className="h-4 w-4" /> /dpo-returns, /sales-returns, /advanced-search</h4>
                    <div className="space-y-1.5 pl-4">
                      <Endpoint method="GET" path="/dpo-returns" />
                      <Endpoint method="GET" path="/dpo-returns/:id" />
                      <Endpoint method="POST" path="/dpo-returns" />
                      <Endpoint method="POST" path="/dpo-returns/:id/approve" />
                      <Endpoint method="GET" path="/sales-returns" />
                      <Endpoint method="GET" path="/sales-returns/:id" />
                      <Endpoint method="POST" path="/sales-returns" />
                      <Endpoint method="POST" path="/sales-returns/:id/approve" />
                      <Endpoint method="POST" path="/sales-returns/:id/reject" />
                      <Endpoint method="DELETE" path="/sales-returns/:id" />
                      <Endpoint method="GET" path="/advanced-search/search" />
                    </div>
                  </div>
                </div>
              </DocSection>

              <DocSection
                id="frontend-api"
                title="Frontend API (apiClient)"
                description="API client methods in src/lib/api.ts"
                icon={Code2}
              >
                <p className="text-sm text-muted-foreground">
                  Import <code className="bg-muted px-1 rounded">apiClient</code> or <code className="bg-muted px-1 rounded">default</code> from <code className="bg-muted px-1 rounded">@/lib/api</code>. All methods return a promise (API response or {"{ error }"}).
                </p>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Parts</h4>
                    <ul className="text-sm font-mono space-y-1">
                      <li>getParts, getPart, createPart, updatePart, deletePart</li>
                      <li>getPartsForPriceManagement, bulkUpdatePrices, updatePartPrices, getPriceHistory</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Dropdowns & attributes</h4>
                    <ul className="text-sm font-mono space-y-1">
                      <li>getMasterParts, getBrands, getCategories, getSubcategories, getApplications, getPartsForDropdown</li>
                      <li>getAllCategories, createCategory, updateCategory, deleteCategory</li>
                      <li>getAllSubcategories, createSubcategory, updateSubcategory, deleteSubcategory</li>
                      <li>getAllBrands, createBrand, updateBrand, deleteBrand</li>
                      <li>getAllApplications, createApplication, updateApplication, deleteApplication, removeApplicationDuplicates</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Inventory</h4>
                    <ul className="text-sm font-mono space-y-1">
                      <li>getInventoryDashboard, getStockMovements, createStockMovement</li>
                      <li>getStockBalance, getStockBalances, getStockBalanceValuation, getStockAnalysis</li>
                      <li>getTransfers, getTransfer, createTransfer, updateTransfer, deleteTransfer</li>
                      <li>getAdjustments, createAdjustment, getAdjustment, updateAdjustment, deleteAdjustment, getAdjustmentsByStore, approveAdjustment</li>
                      <li>getPurchaseOrders, createPurchaseOrder, getPurchaseOrder, getPurchaseOrdersByPart, updatePurchaseOrder, deletePurchaseOrder</li>
                      <li>getStores, createStore, updateStore, deleteStore</li>
                      <li>getRacks, createRack, updateRack, deleteRack</li>
                      <li>getShelves, createShelf, updateShelf, deleteShelf</li>
                      <li>getMultiDimensionalReport</li>
                      <li>getDirectPurchaseOrders, getDirectPurchaseOrdersByPart, getDirectPurchaseOrder, createDirectPurchaseOrder, updateDirectPurchaseOrder, deleteDirectPurchaseOrder</li>
                      <li>reserveStock, getReservedStock, getAvailableStock, getReservedQuantity</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Expenses</h4>
                    <ul className="text-sm font-mono space-y-1">
                      <li>getExpenseTypes, createExpenseType, updateExpenseType, deleteExpenseType</li>
                      <li>getPostedExpenses, createPostedExpense</li>
                      <li>getOperationalExpenses, createOperationalExpense, getOperationalExpense</li>
                      <li>getExpenseStatistics</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Accounting & financial</h4>
                    <ul className="text-sm font-mono space-y-1">
                      <li>getMainGroups, seedMainGroups, seedSubgroups, seedRequiredAccounts, createMainGroup</li>
                      <li>getSubgroups, createSubgroup, createAccount</li>
                      <li>getAccounts</li>
                      <li>getGeneralJournal, getTrialBalance, getBalanceSheet, getIncomeStatement, getLedgers, getAccountGroups</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Customers & suppliers</h4>
                    <ul className="text-sm font-mono space-y-1">
                      <li>getCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer</li>
                      <li>getSuppliers, getSupplier, createSupplier, updateSupplier, deleteSupplier</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Reports</h4>
                    <ul className="text-sm font-mono space-y-1">
                      <li>getDashboardMetrics, getHourlySales, getTopSelling, getRecentActivity</li>
                      <li>getSalesReport, getPeriodicSales, getSalesByType, getTargetAchievement</li>
                      <li>getStockMovement, getBrandWise, getPurchasesReport, getPurchaseComparison, getImportCostSummary, getExpensesReport</li>
                      <li>getCustomerAnalysis, getCustomerAging, getSupplierPerformance</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Users, roles, system</h4>
                    <ul className="text-sm font-mono space-y-1">
                      <li>getUsers, getUser, createUser, updateUser, deleteUser</li>
                      <li>getRoles, getRole, createRole, updateRole, deleteRole</li>
                      <li>getActivityLogs, getApprovalFlows, getApprovalFlow, createApprovalFlow, updateApprovalFlow, deleteApprovalFlow, getPendingApprovals</li>
                      <li>getBackups, getBackup, createBackup, restoreBackup, downloadBackup, deleteBackup, importBackup, getBackupSchedules</li>
                      <li>getCompanyProfile, updateCompanyProfile</li>
                      <li>getWhatsAppSettings, updateWhatsAppSettings, sendWhatsAppMessage</li>
                      <li>getLongCatSettings, updateLongCatSettings, sendLongCatChat, sendLongCatMessage</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Kits, vouchers, sales</h4>
                    <ul className="text-sm font-mono space-y-1">
                      <li>getKits, getKit, createKit, updateKit, deleteKit</li>
                      <li>getVouchers, getVoucher, createVoucher, updateVoucher, deleteVoucher</li>
                      <li>getSalesInquiries, getSalesInquiry, createSalesInquiry, updateSalesInquiry, deleteSalesInquiry, convertInquiryToQuotation</li>
                      <li>getSalesQuotations, getSalesQuotation, createSalesQuotation, updateSalesQuotation, deleteSalesQuotation, convertQuotationToInvoice</li>
                      <li>getSalesInvoices, getSalesInvoice, getSalesInvoicesByPart, createSalesInvoice, updateSalesInvoice</li>
                      <li>approveSalesInvoice, recordDelivery, recordPayment, holdInvoice, releaseHold, cancelInvoice, deleteInvoice, updateInvoiceStatus</li>
                    </ul>
                  </div>
                </div>
              </DocSection>

              <DocSection
                id="environment"
                title="Environment & Deployment"
                description="Configuration and URLs"
                icon={Layers}
              >
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Frontend</h4>
                    <ul className="text-sm space-y-1">
                      <li>Base path: <code className="bg-muted px-1 rounded">{base}</code> (Vite <code className="bg-muted px-1 rounded">base</code>)</li>
                      <li>Dev server: port 8081 (or config)</li>
                      <li><code className="bg-muted px-1 rounded">VITE_API_URL</code> — optional override for API base</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Backend</h4>
                    <ul className="text-sm space-y-1">
                      <li>Port: <code className="bg-muted px-1 rounded">PORT</code> (default 3001; often 3002 in dev)</li>
                      <li><code className="bg-muted px-1 rounded">DATABASE_URL</code> — Prisma SQLite URL</li>
                      <li><code className="bg-muted px-1 rounded">CORS_ORIGIN</code> — comma-separated origins</li>
                      <li><code className="bg-muted px-1 rounded">SERVER_ORIGIN</code> — production server origin</li>
                      <li>Timezone: <code className="bg-muted px-1 rounded">TZ=Asia/Karachi</code></li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">API base URL</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Resolved by <code className="bg-muted px-1 rounded">getApiBaseUrl()</code> in <code className="bg-muted px-1 rounded">src/lib/api.ts</code>:
                    </p>
                    <ul className="text-sm space-y-1">
                      <li>If <code className="bg-muted px-1 rounded">VITE_API_URL</code> is set → use it</li>
                      <li>If app is under <code className="bg-muted px-1 rounded">/dev-koncepts</code> → <code className="bg-muted px-1 rounded">{"<origin>"}/dev-koncepts/api</code></li>
                      <li>Dev (localhost) → <code className="bg-muted px-1 rounded">http://localhost:3002/api</code></li>
                      <li>Otherwise → <code className="bg-muted px-1 rounded">{"<origin>"}/api</code></li>
                    </ul>
                    <p className="text-sm text-muted-foreground mt-2">
                      Current base: <code className="bg-muted px-1 rounded font-mono break-all">{apiBase}</code>
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Production</h4>
                    <ul className="text-sm space-y-1">
                      <li>Serve frontend from <code className="bg-muted px-1 rounded">{base}/</code>; proxy <code className="bg-muted px-1 rounded">{base}/api</code> to backend.</li>
                      <li>Run <code className="bg-muted px-1 rounded">npx prisma migrate deploy</code> before starting backend.</li>
                      <li>PM2: <code className="bg-muted px-1 rounded">ecosystem.config.cjs</code> / <code className="bg-muted px-1 rounded">backend/ecosystem.config.js</code>.</li>
                    </ul>
                  </div>
                </div>
              </DocSection>
            </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Documentation;
