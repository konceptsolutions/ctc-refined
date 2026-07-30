import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { cn } from "@/lib/utils";
import {
  ArrowRightLeft,
  Truck,
  BarChart3,
  Settings2,
  Layers,
  Activity,
  ClipboardCheck,
  ShoppingCart,
  FileText,
  Archive,
  Store,
  Package,
  Undo2,
  Search,
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

import { StoreManagementTab } from "@/components/settings/StoreManagementTab";
import { getUserRole, isStoreUserRole } from "@/utils/auth";

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
}

const defaultInventoryTab: InventoryTab = "purchase-inquiry";

const tabs: TabConfig[] = [
  // { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Overview & analytics" }, // Hidden temporarily
  { id: "purchase-inquiry", label: "Purchase Inquiry", icon: Search, description: "Purchase inquiry with PO/CO/BO details" },
  { id: "current-stock", label: "Current Stock", icon: Package, description: "View current stock with prices" },
  { id: "store-management", label: "Store Management", icon: Store, description: "Manage stores & locations" },
  { id: "stock-in-out", label: "Stock Movement", icon: ArrowRightLeft, description: "Record stock movements" },
  // { id: "stock-transfer", label: "Stock Transfer", icon: Truck, description: "Transfer between locations" }, // Hidden temporarily
  { id: "adjust-item", label: "Adjust Item", icon: Settings2, description: "Stock quantity adjustments" },
  // { id: "stock-balance", label: "Balance & Valuation", icon: BarChart3, description: "Balance & valuation" }, // Hidden temporarily
  // { id: "multi-dimensional", label: "Multi-Dimensional", icon: Layers, description: "Multi-dimensional analysis" }, // Hidden temporarily
  // { id: "stock-analysis", label: "Stock Analysis", icon: Activity, description: "Fast, slow & dead stock" }, // Hidden temporarily
  // { id: "stock-verification", label: "Verification", icon: ClipboardCheck, description: "Physical stock verification" }, // Hidden temporarily
  // { id: "purchase-order", label: "Purchase Order", icon: ShoppingCart, description: "Manage purchase orders" }, // Hidden temporarily
  { id: "local-inquiry", label: "Local Inquiry", icon: ClipboardCheck, description: "Local purchase inquiries" },
  { id: "direct-purchase-order", label: "Local Purchase", icon: FileText, description: "Local purchase orders" },
  { id: "dpo-return", label: "DPO Return", icon: Undo2, description: "Manage DPO returns" },
];

const Inventory = () => {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();
  const isStoreUser = getUserRole() === "store" || isStoreUserRole();
  const availableTabs = isStoreUser
    ? tabs.filter((t) => t.id === "current-stock")
    : tabs;

  const activeTab: InventoryTab = availableTabs.some((t) => t.id === tab)
    ? (tab as InventoryTab)
    : defaultInventoryTab;

  // Ensure /inventory redirects to the default dedicated page.
  useEffect(() => {
    if (isStoreUser) {
      if (tab !== "current-stock") {
        navigate("/inventory/current-stock", { replace: true });
      }
      return;
    }
    if (!tab || !tabs.some((t) => t.id === tab)) {
      navigate(`/inventory/${defaultInventoryTab}`, { replace: true });
    }
  }, [tab, navigate, isStoreUser]);

  const handleTabChange = (tabId: InventoryTab) => navigate(`/inventory/${tabId}`);

  const renderContent = () => {
    switch (activeTab) {
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
        return <CurrentStock />;
    }
  };

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden ml-16">
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
