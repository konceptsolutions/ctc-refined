import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneralJournalTab } from "./GeneralJournalTab";
import { TrialBalanceTab } from "./TrialBalanceTab";
import { IncomeStatementTab } from "./IncomeStatementTab";
import { BalanceSheetTab } from "./BalanceSheetTab";
import { LedgersTab } from "./LedgersTab";
import { DailyClosingTab } from "./DailyClosingTab";

export const FinancialStatementsModule = () => {
  const [activeTab, setActiveTab] = useState("general-journal");

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

        <TabsContent value="daily-closing" className="animate-fade-in mt-4">
          <DailyClosingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};
