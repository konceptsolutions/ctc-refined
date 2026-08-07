import { useEffect } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { SupplierManagement } from "@/components/manage/SupplierManagement";
import { CustomerManagement } from "@/components/manage/CustomerManagement";
import { Truck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate, useParams } from "react-router-dom";
import { usePermissions } from "@/permissions/PermissionsProvider";

type ManageTab = "suppliers" | "customers";

const Manage = () => {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();

  const { can } = usePermissions();
  const tabs = (
    [
      { id: "suppliers" as const, label: "Suppliers", icon: Truck, permission: "page.manage.suppliers" },
      { id: "customers" as const, label: "Customers", icon: Users, permission: "page.manage.customers" },
    ] as const
  ).filter((t) => can(t.permission));

  const defaultTab: ManageTab = (tabs[0]?.id as ManageTab) || "suppliers";
  const activeTab: ManageTab = tabs.some((t) => t.id === tab)
    ? (tab as ManageTab)
    : defaultTab;

  useEffect(() => {
    if (!tabs.length) {
      navigate("/", { replace: true });
      return;
    }
    if (!tab || !tabs.some((t) => t.id === tab)) {
      navigate(`/manage/${defaultTab}`, { replace: true });
    }
  }, [tab, navigate, tabs, defaultTab]);

  const handleTabChange = (nextTab: ManageTab) => navigate(`/manage/${nextTab}`);

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden app-content-offset">
        <Header />

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
                      : "text-muted-foreground hover:text-foreground"
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
          {activeTab === "suppliers" && <SupplierManagement />}
          {activeTab === "customers" && <CustomerManagement />}
        </main>
      </div>
    </div>
  );
};

export default Manage;
