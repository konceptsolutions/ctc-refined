import { useEffect } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { SupplierManagement } from "@/components/manage/SupplierManagement";
import { CustomerManagement } from "@/components/manage/CustomerManagement";
import { Truck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate, useParams } from "react-router-dom";

type ManageTab = "suppliers" | "customers";

const Manage = () => {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();

  const activeTab: ManageTab = tab === "customers" ? "customers" : "suppliers";

  // Ensure /manage redirects to the default dedicated page.
  useEffect(() => {
    if (!tab) navigate("/manage/suppliers", { replace: true });
  }, [tab, navigate]);

  const handleTabChange = (nextTab: ManageTab) => navigate(`/manage/${nextTab}`);

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden ml-16">
        <Header />

        {/* Tab Navigation - Same style as Parts page */}
        <div className="bg-card border-b border-border px-4 py-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleTabChange("suppliers")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all rounded",
                activeTab === "suppliers"
                  ? "border border-primary text-primary bg-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Truck className="w-3.5 h-3.5" />
              Suppliers
            </button>
            <button
              onClick={() => handleTabChange("customers")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all rounded",
                activeTab === "customers"
                  ? "border border-primary text-primary bg-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Users className="w-3.5 h-3.5" />
              Customers
            </button>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 p-4 overflow-auto">
          {activeTab === "suppliers" && <SupplierManagement />}
          {activeTab === "customers" && <CustomerManagement />}
        </main>
      </div>
    </div>
  );
};

export default Manage;
