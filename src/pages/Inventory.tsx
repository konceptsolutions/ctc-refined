import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { cn } from "@/lib/utils";
import {
  ArrowRightLeft,
  Settings2,
  ClipboardCheck,
  FileText,
  Store,
  Package,
  Undo2,
  Search,
  LayoutDashboard,
  Layers,
  Activity,
} from "lucide-react";

// Inventory sub-modules
import { StockInOut } from "@/components/inventory/StockInOut";
import { StockBalance } from "@/components/inventory/StockBalance";
import { AdjustItem } from "@/components/inventory/AdjustItem";
import { MultiDimensionalReport } from "@/components/inventory/MultiDimensionalReport";
import { StockAnalysis } from "@/components/inventory/StockAnalysis";
import { StockVerification } from "@/components/inventory/StockVerification";
import { PurchaseOrder } from "@/components/inventory/PurchaseOrder";
import { DirectPurchaseOrder } from "@/components/inventory/DirectPurchaseOrder";
import { LocalInquiry } from "@/components/inventory/LocalInquiry";
import { DPOReturn } from "@/components/inventory/DPOReturn";
import { CurrentStock } from "@/components/inventory/CurrentStock";
import { PurchaseInquiry } from "@/components/inventory/PurchaseInquiry";
import { InventoryDashboard } from "@/components/inventory/InventoryDashboard";

import { StoreManagementTab } from "@/components/settings/StoreManagementTab";
import { usePermissions } from "@/permissions/PermissionsProvider";

type InventoryTab =
  | "dashboard"
  | "current-stock"
  | "stock-in-out"
  | "adjust-item"
  | "stock-balance"
  | "multi-dimensional"
  | "stock-analysis"
  | "stock-verification"
  | "purchase-order"
  | "local-inquiry"
  | "direct-purchase-order"
  | "dpo-return"
  | "store-management"
  | "purchase-inquiry";

interface TabConfig {
  id: InventoryTab;
  label: string;
  icon: React.ElementType;
  description: string;
  permission: string;
}

const tabs: TabConfig[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Overview & analytics", permission: "page.inventory.dashboard" },
  { id: "purchase-inquiry", label: "Purchase Inquiry", icon: Search, description: "Purchase inquiry with PO/CO/BO details", permission: "page.inventory.purchase-inquiry" },
  { id: "current-stock", label: "Current Stock", icon: Package, description: "View current stock with prices", permission: "page.inventory.current-stock" },
  { id: "store-management", label: "Store Management", icon: Store, description: "Manage stores & locations", permission: "page.inventory.store-management" },
  { id: "stock-in-out", label: "Stock Movement", icon: ArrowRightLeft, description: "Record stock movements", permission: "page.inventory.stock-in-out" },
  { id: "adjust-item", label: "Adjust Item", icon: Settings2, description: "Stock quantity adjustments", permission: "page.inventory.adjust-item" },
  { id: "multi-dimensional", label: "Multi-Dimensional", icon: Layers, description: "Multi-dimensional analysis", permission: "page.inventory.multi-dimensional" },
  { id: "stock-analysis", label: "Stock Analysis", icon: Activity, description: "Fast, slow & dead stock", permission: "page.inventory.stock-analysis" },
  { id: "local-inquiry", label: "Local Inquiry", icon: ClipboardCheck, description: "Local purchase inquiries", permission: "page.inventory.local-inquiry" },
  { id: "direct-purchase-order", label: "Local Purchase", icon: FileText, description: "Local purchase orders", permission: "page.inventory.direct-purchase-order" },
  { id: "dpo-return", label: "DPO Return", icon: Undo2, description: "Manage DPO returns", permission: "page.inventory.dpo-return" },
];

const Inventory = () => {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();
  const { can } = usePermissions();
  const availableTabs = tabs.filter((t) => can(t.permission));
  const defaultInventoryTab: InventoryTab =
    (availableTabs[0]?.id as InventoryTab) || "current-stock";

  const activeTab: InventoryTab = availableTabs.some((t) => t.id === tab)
    ? (tab as InventoryTab)
    : defaultInventoryTab;

  useEffect(() => {
    if (!availableTabs.length) {
      navigate("/", { replace: true });
      return;
    }
    if (!tab || !availableTabs.some((t) => t.id === tab)) {
      navigate(`/inventory/${defaultInventoryTab}`, { replace: true });
    }
  }, [tab, navigate, availableTabs, defaultInventoryTab]);

  const handleTabChange = (tabId: InventoryTab) => navigate(`/inventory/${tabId}`);

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <InventoryDashboard />;
      case "current-stock":
        return <CurrentStock />;
      case "store-management":
        return <StoreManagementTab />;
      case "stock-in-out":
        return <StockInOut />;
      case "adjust-item":
        return <AdjustItem />;
      case "stock-balance":
        return <StockBalance />;
      case "multi-dimensional":
        return <MultiDimensionalReport />;
      case "stock-analysis":
        return <StockAnalysis />;
      case "stock-verification":
        return <StockVerification />;
      case "purchase-order":
        return <PurchaseOrder />;
      case "purchase-inquiry":
        return <PurchaseInquiry />;
      case "local-inquiry":
        return <LocalInquiry />;
      case "direct-purchase-order":
        return <DirectPurchaseOrder />;
      case "dpo-return":
        return <DPOReturn />;

      default:
        return <InventoryDashboard />;
    }
  };

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden app-content-offset">
        <Header />

        {/* Horizontal Scrollable Tab Navigation */}
        <div className="bg-card border-b border-border">
          <div className="px-4 py-2 overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-2 min-w-max">
              {availableTabs.map((tab) => {
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
        <main className="flex-1 p-4 overflow-auto">
          <div className="animate-fade-in">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Inventory;
