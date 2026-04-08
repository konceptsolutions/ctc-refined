import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StorePanel } from "@/components/store/StorePanel";
import { RackAndShelf } from "@/components/inventory/RackAndShelf";
import { cn } from "@/lib/utils";
import { Package, Archive } from "lucide-react";

type StoreTab = "orders" | "rack-shelf";

interface TabConfig {
  id: StoreTab;
  label: string;
  icon: React.ElementType;
  description: string;
}

const tabs: TabConfig[] = [
  { id: "orders", label: "Orders", icon: Package, description: "Manage store orders" },
  { id: "rack-shelf", label: "Racks & Shelves", icon: Archive, description: "Manage racks and shelves" },
];

const Store = () => {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();
  const [storeName, setStoreName] = useState<string>("");

  const activeTab: StoreTab = tabs.some((t) => t.id === tab)
    ? (tab as StoreTab)
    : "orders";

  // Ensure /store redirects to the default tab
  useEffect(() => {
    if (!tab) navigate("/store/orders", { replace: true });
  }, [tab, navigate]);

  const handleTabChange = (tabId: StoreTab) => navigate(`/store/${tabId}`);

  const renderContent = () => {
    switch (activeTab) {
      case "orders":
        return <StorePanel onStoreChange={setStoreName} />;
      case "rack-shelf":
        return <RackAndShelf />;
      default:
        return <StorePanel onStoreChange={setStoreName} />;
    }
  };

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />

      <div className={cn("flex-1 flex flex-col overflow-hidden", "ml-16")}>
        <StoreHeader storeName={storeName} />

        {/* Horizontal Scrollable Tab Navigation */}
        <div className="bg-card border-b border-border">
          <div className="px-4 py-2 overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-2 min-w-max">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 text-xs font-medium whitespace-nowrap group",
                      activeTab === tab.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <div className="max-w-7xl mx-auto w-full">
            <div className="animate-fade-in">
              {renderContent()}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Store;
