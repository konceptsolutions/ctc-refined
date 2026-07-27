import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneralJournalTab } from "./GeneralJournalTab";
import { TrialBalanceTab } from "./TrialBalanceTab";
import { IncomeStatementTab } from "./IncomeStatementTab";
import { BalanceSheetTab } from "./BalanceSheetTab";
import { LedgersTab } from "./LedgersTab";
import { InternationalSupplierLedgersTab } from "./InternationalSupplierLedgersTab";
import { DailyClosingModule } from "./DailyClosingModule";

const VALID_TABS = [
  "general-journal",
  "trial-balance",
  "income-statement",
  "balance-sheet",
  "ledgers",
  "international-supplier-ledgers",
  "daily-closing",
] as const;

type FinancialTab = (typeof VALID_TABS)[number];

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
  "daily-closing": "daily-closing",
  closing: "daily-closing",
};

function resolveTab(tab: string | null): FinancialTab {
  if (!tab) return "general-journal";
  return TAB_ALIASES[tab.toLowerCase()] ?? "general-journal";
}

export const FinancialStatementsModule = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveTab(searchParams.get("tab"));

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
          <TabsTrigger 
            value="general-journal" 
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2 transition-all duration-200"
          >
            <span className="mr-1">λ</span> General Journal
          </TabsTrigger>
          <TabsTrigger 
            value="trial-balance"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2 transition-all duration-200"
          >
            <span className="mr-1">λ</span> Trial Balance
          </TabsTrigger>
          <TabsTrigger 
            value="income-statement"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2 transition-all duration-200"
          >
            <span className="mr-1">λ</span> Income Statement
          </TabsTrigger>
          <TabsTrigger 
            value="balance-sheet"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2 transition-all duration-200"
          >
            <span className="mr-1">λ</span> Balance Sheet
          </TabsTrigger>
          <TabsTrigger 
            value="ledgers"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2 transition-all duration-200"
          >
            <span className="mr-1">λ</span> Ledgers
          </TabsTrigger>
          <TabsTrigger
            value="international-supplier-ledgers"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2 transition-all duration-200"
          >
            <span className="mr-1">λ</span> International Supplier Ledger
          </TabsTrigger>
          <TabsTrigger 
            value="daily-closing"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2 transition-all duration-200"
          >
            <span className="mr-1">λ</span> Daily Closing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general-journal" className="animate-fade-in mt-4">
          <GeneralJournalTab />
        </TabsContent>

        <TabsContent value="trial-balance" className="animate-fade-in mt-4">
          <TrialBalanceTab />
        </TabsContent>

        <TabsContent value="income-statement" className="animate-fade-in mt-4">
          <IncomeStatementTab />
        </TabsContent>

        <TabsContent value="balance-sheet" className="animate-fade-in mt-4">
          <BalanceSheetTab />
        </TabsContent>

        <TabsContent value="ledgers" className="animate-fade-in mt-4">
          <LedgersTab />
        </TabsContent>

        <TabsContent value="international-supplier-ledgers" className="animate-fade-in mt-4">
          <InternationalSupplierLedgersTab />
        </TabsContent>

        <TabsContent value="daily-closing" className="animate-fade-in mt-4">
          <DailyClosingModule />
        </TabsContent>
      </Tabs>
    </div>
  );
};
