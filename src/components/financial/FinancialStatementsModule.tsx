import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneralJournalTab } from "./GeneralJournalTab";
import { TrialBalanceTab } from "./TrialBalanceTab";
import { IncomeStatementTab } from "./IncomeStatementTab";
import { BalanceSheetTab } from "./BalanceSheetTab";
import { LedgersTab } from "./LedgersTab";
import { InternationalSupplierLedgersTab } from "./InternationalSupplierLedgersTab";
import { DailyClosingModule } from "./DailyClosingModule";
import { SupplierCustomerComparisonTab } from "./SupplierCustomerComparisonTab";
import { usePermissions } from "@/permissions/PermissionsProvider";

const TAB_DEFS = [
  { id: "general-journal", label: "General Journal", permission: "page.financial.general-journal" },
  { id: "trial-balance", label: "Trial Balance", permission: "page.financial.trial-balance" },
  { id: "income-statement", label: "Income Statement", permission: "page.financial.income-statement" },
  { id: "balance-sheet", label: "Balance Sheet", permission: "page.financial.balance-sheet" },
  { id: "ledgers", label: "Ledgers", permission: "page.financial.ledgers" },
  {
    id: "international-supplier-ledgers",
    label: "International Supplier Ledger",
    permission: "page.financial.international-supplier-ledgers",
  },
  {
    id: "supplier-customer-comparison",
    label: "Supplier Customer Comparison",
    permission: "page.financial.supplier-customer-comparison",
  },
  { id: "daily-closing", label: "Daily Closing", permission: "page.financial.daily-closing" },
] as const;

type FinancialTab = (typeof TAB_DEFS)[number]["id"];

const TAB_ALIASES: Record<string, FinancialTab> = {
  journal: "general-journal",
  "general-journal": "general-journal",
  trial: "trial-balance",
  "trial-balance": "trial-balance",
  income: "income-statement",
  "income-statement": "income-statement",
  balance: "balance-sheet",
  "balance-sheet": "balance-sheet",
  ledger: "ledgers",
  ledgers: "ledgers",
  "international-supplier-ledgers": "international-supplier-ledgers",
  "supplier-customer-comparison": "supplier-customer-comparison",
  comparison: "supplier-customer-comparison",
  "supplier-customer": "supplier-customer-comparison",
  "daily-closing": "daily-closing",
  closing: "daily-closing",
};

export const FinancialStatementsModule = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = usePermissions();
  const allowedTabs = TAB_DEFS.filter((t) => can(t.permission));
  const defaultTab: FinancialTab = allowedTabs[0]?.id || "general-journal";

  const resolveTab = (tab: string | null): FinancialTab => {
    if (!tab) return defaultTab;
    const resolved = TAB_ALIASES[tab.toLowerCase()] ?? defaultTab;
    return allowedTabs.some((t) => t.id === resolved) ? resolved : defaultTab;
  };

  const activeTab = resolveTab(searchParams.get("tab"));

  useEffect(() => {
    if (!allowedTabs.some((t) => t.id === activeTab)) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("tab", defaultTab);
      setSearchParams(nextParams, { replace: true });
    }
  }, [activeTab, allowedTabs, defaultTab, searchParams, setSearchParams]);

  const setActiveTab = (tab: string) => {
    const next = resolveTab(tab);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", next);
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/50 p-1 h-auto flex-wrap">
          {allowedTabs.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2 transition-all duration-200"
            >
              <span className="mr-1">λ</span> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {can("page.financial.general-journal") && (
          <TabsContent value="general-journal" className="animate-fade-in mt-4">
            <GeneralJournalTab />
          </TabsContent>
        )}
        {can("page.financial.trial-balance") && (
          <TabsContent value="trial-balance" className="animate-fade-in mt-4">
            <TrialBalanceTab />
          </TabsContent>
        )}
        {can("page.financial.income-statement") && (
          <TabsContent value="income-statement" className="animate-fade-in mt-4">
            <IncomeStatementTab />
          </TabsContent>
        )}
        {can("page.financial.balance-sheet") && (
          <TabsContent value="balance-sheet" className="animate-fade-in mt-4">
            <BalanceSheetTab />
          </TabsContent>
        )}
        {can("page.financial.ledgers") && (
          <TabsContent value="ledgers" className="animate-fade-in mt-4">
            <LedgersTab />
          </TabsContent>
        )}
        {can("page.financial.international-supplier-ledgers") && (
          <TabsContent value="international-supplier-ledgers" className="animate-fade-in mt-4">
            <InternationalSupplierLedgersTab />
          </TabsContent>
        )}
        {can("page.financial.supplier-customer-comparison") && (
          <TabsContent value="supplier-customer-comparison" className="animate-fade-in mt-4">
            <SupplierCustomerComparisonTab />
          </TabsContent>
        )}
        {can("page.financial.daily-closing") && (
          <TabsContent value="daily-closing" className="animate-fade-in mt-4">
            <DailyClosingModule />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};
