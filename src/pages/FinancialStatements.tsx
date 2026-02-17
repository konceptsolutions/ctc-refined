import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { FinancialStatementsModule } from "@/components/financial/FinancialStatementsModule";

const FinancialStatements = () => {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="ml-16">
        <Header />
        <main className="p-6">
          <div className="max-w-[1600px] mx-auto">
            <h1 className="text-2xl font-bold text-foreground mb-6">Financial Statements</h1>
            <FinancialStatementsModule />
          </div>
        </main>
      </div>
    </div>
  );
};

export default FinancialStatements;
