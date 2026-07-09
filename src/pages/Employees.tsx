import { useEffect } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { EmployeeManagement } from "@/components/employees/EmployeeManagement";
import { LoanAdvanceManagement } from "@/components/employees/LoanAdvanceManagement";
import { PayrollManagement } from "@/components/employees/PayrollManagement";
import { HandCoins, Receipt, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate, useParams } from "react-router-dom";

type EmployeeTab = "staff" | "payroll" | "loans-advances";

const Employees = () => {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();

  const activeTab: EmployeeTab =
    tab === "loans-advances" ? "loans-advances" : tab === "payroll" ? "payroll" : "staff";

  useEffect(() => {
    if (!tab) navigate("/employees/staff", { replace: true });
  }, [tab, navigate]);

  const handleTabChange = (nextTab: EmployeeTab) => navigate(`/employees/${nextTab}`);

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden ml-16">
        <Header />

        <div className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <UserCircle className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Employees</h1>
              <p className="text-sm text-muted-foreground">
                Manage staff records, salaries, loans, and advances
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card border-b border-border px-4 py-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleTabChange("staff")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all rounded",
                activeTab === "staff"
                  ? "border border-primary text-primary bg-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <UserCircle className="w-3.5 h-3.5" />
              Staff
            </button>
            <button
              onClick={() => handleTabChange("payroll")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all rounded",
                activeTab === "payroll"
                  ? "border border-primary text-primary bg-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Receipt className="w-3.5 h-3.5" />
              Payroll
            </button>
            <button
              onClick={() => handleTabChange("loans-advances")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all rounded",
                activeTab === "loans-advances"
                  ? "border border-primary text-primary bg-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <HandCoins className="w-3.5 h-3.5" />
              Loans & Advances
            </button>
          </div>
        </div>

        <main className="flex-1 p-4 overflow-auto">
          {activeTab === "staff" && <EmployeeManagement />}
          {activeTab === "payroll" && <PayrollManagement />}
          {activeTab === "loans-advances" && <LoanAdvanceManagement />}
        </main>
      </div>
    </div>
  );
};

export default Employees;
