import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { ChartOfAccounts } from "@/components/accounting/ChartOfAccounts";
import { BookOpen } from "lucide-react";

const Accounting = () => {
  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden ml-16">
        <Header />

        {/* Page Header */}
        <div className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Accounting</h1>
              <p className="text-sm text-muted-foreground">Manage chart of accounts, main groups, subgroups, and accounts</p>
            </div>
          </div>
        </div>

        <main className="flex-1 p-4 overflow-auto">
          <div className="animate-fade-in">
            <ChartOfAccounts />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Accounting; 
