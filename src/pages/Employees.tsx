import { useEffect } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { EmployeeManagement } from "@/components/employees/EmployeeManagement";
import { LoanAdvanceManagement } from "@/components/employees/LoanAdvanceManagement";
import { PayrollManagement } from "@/components/employees/PayrollManagement";
import { HandCoins, Receipt, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate, useParams } from "react-router-dom";
import { usePermissions } from "@/permissions/PermissionsProvider";

type EmployeeTab = "staff" | "payroll" | "loans-advances";

const Employees = () => {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();

  const { can } = usePermissions();
  const tabs = (
    [
      { id: "staff" as const, label: "Staff", icon: UserCircle, permission: "page.employees.staff" },
      { id: "payroll" as const, label: "Payroll", icon: Receipt, permission: "page.employees.payroll" },
      {
        id: "loans-advances" as const,
        label: "Loans & Advances",
        icon: HandCoins,
        permission: "page.employees.loans-advances",
      },
    ] as const
  ).filter((t) => can(t.permission));

  const defaultTab: EmployeeTab = (tabs[0]?.id as EmployeeTab) || "staff";
  const activeTab: EmployeeTab = tabs.some((t) => t.id === tab)
    ? (tab as EmployeeTab)
    : defaultTab;

  useEffect(() => {
    if (!tabs.length) {
      navigate("/", { replace: true });
      return;
    }
    if (!tab || !tabs.some((t) => t.id === tab)) {
      navigate(`/employees/${defaultTab}`, { replace: true });
    }
  }, [tab, navigate, tabs, defaultTab]);

  const handleTabChange = (nextTab: EmployeeTab) => navigate(`/employees/${nextTab}`);

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden app-content-offset">
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
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => handleTabChange(t.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all rounded",
                    activeTab === t.id
                      ? "border border-primary text-primary bg-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
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
