import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  FileText, 
  Calendar, 
  CreditCard, 
  ArrowUpDown, 
  Tag, 
  ShoppingCart, 
  DollarSign, 
  Users, 
  Clock, 
  Truck,
  Target,
  BarChart3,
  Filter,
  Wallet,
  ReceiptText,
  TrendingUp,
} from "lucide-react";
import RealTimeDashboard from "./RealTimeDashboard";
import SalesReportTab from "./SalesReportTab";
import PeriodicSalesTab from "./PeriodicSalesTab";
import SalesByTypeTab from "./SalesByTypeTab";
import TargetAchievementTab from "./TargetAchievementTab";
import StockMovementTab from "./StockMovementTab";
import BrandWiseTab from "./BrandWiseTab";
import PurchasesReportTab from "./PurchasesReportTab";
import PurchaseComparisonTab from "./PurchaseComparisonTab";
import ImportCostSummaryTab from "./ImportCostSummaryTab";
import ExpensesReportTab from "./ExpensesReportTab";
import CustomerAnalysisTab from "./CustomerAnalysisTab";
import CustomerAgingTab from "./CustomerAgingTab";
import SupplierPerformanceTab from "./SupplierPerformanceTab";
import TopSellingItemsTab from "./TopSellingItemsTab";
import SupplierPayableTab from "./SupplierPayableTab";
import CustomerReceivableTab from "./CustomerReceivableTab";
import { SaleProfitReport } from "@/components/sales/SaleProfitReport";

type CategoryType = "overview" | "sales" | "inventory" | "financial" | "analytics";

interface SubTab {
  id: string;
  label: string;
  icon: React.ElementType;
}

const categories: { id: CategoryType; label: string; color: string }[] = [
  { id: "overview", label: "Overview", color: "bg-primary" },
  { id: "sales", label: "Sales Reports", color: "bg-success" },
  { id: "inventory", label: "Inventory Reports", color: "bg-info" },
  { id: "financial", label: "Financial Reports", color: "bg-chart-purple" },
  { id: "analytics", label: "Analytics", color: "bg-warning" },
];

const subTabs: Record<CategoryType, SubTab[]> = {
  overview: [
    { id: "dashboard", label: "Real-Time Dashboard", icon: LayoutDashboard },
  ],
  sales: [
    { id: "sales-report", label: "Sales Report", icon: FileText },
    { id: "sale-profit-report", label: "Sale Profit", icon: TrendingUp },
    { id: "top-selling-items", label: "Item Sales Analytics", icon: BarChart3 },
    { id: "periodic-sales", label: "Periodic Sales", icon: Calendar },
    { id: "sales-by-type", label: "Sales by Type", icon: CreditCard },
    { id: "target-achievement", label: "Target vs Achievement", icon: Target },
  ],
  inventory: [
    { id: "stock-movement", label: "Stock Movement", icon: ArrowUpDown },
    { id: "brand-wise", label: "Brand Wise", icon: Tag },
  ],
  financial: [
    { id: "purchases", label: "Purchases", icon: ShoppingCart },
    { id: "purchase-comparison", label: "Purchase Comparison", icon: BarChart3 },
    { id: "import-cost", label: "Import Cost Summary", icon: Truck },
    { id: "expenses", label: "Expenses", icon: DollarSign },
    { id: "supplier-payable", label: "Supplier Payable", icon: Wallet },
    { id: "customer-receivable", label: "Customer Receivable", icon: ReceiptText },
  ],
  analytics: [
    { id: "customer-analysis", label: "Customer Analysis", icon: Users },
    { id: "customer-aging", label: "Customer/Distributor Aging", icon: Clock },
    { id: "supplier-performance", label: "Supplier Performance", icon: Truck },
  ],
};

const CATEGORY_IDS = new Set<string>(categories.map((c) => c.id));

const resolveCategory = (value: string | null): CategoryType => {
  if (value && CATEGORY_IDS.has(value)) return value as CategoryType;
  return "overview";
};

const resolveSubTab = (category: CategoryType, value: string | null): string => {
  const tabs = subTabs[category];
  if (value && tabs.some((t) => t.id === value)) return value;
  return tabs[0].id;
};

const ReportsAnalytics = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCategories, setShowCategories] = useState(true);

  const activeCategory = resolveCategory(searchParams.get("category"));
  const activeSubTab = resolveSubTab(activeCategory, searchParams.get("tab"));

  const updateParams = (category: CategoryType, tab: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("category", category);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  const handleCategoryChange = (category: CategoryType) => {
    updateParams(category, subTabs[category][0].id);
  };

  const handleSubTabChange = (tabId: string) => {
    updateParams(activeCategory, tabId);
  };

  const renderContent = () => {
    switch (activeSubTab) {
      case "dashboard":
        return <RealTimeDashboard />;
      case "sales-report":
        return <SalesReportTab />;
      case "sale-profit-report":
        return <SaleProfitReport />;
      case "periodic-sales":
        return <PeriodicSalesTab />;
      case "top-selling-items":
        return <TopSellingItemsTab />;
      case "sales-by-type":
        return <SalesByTypeTab />;
      case "target-achievement":
        return <TargetAchievementTab />;
      case "stock-movement":
        return <StockMovementTab />;
      case "brand-wise":
        return <BrandWiseTab />;
      case "purchases":
        return <PurchasesReportTab />;
      case "purchase-comparison":
        return <PurchaseComparisonTab />;
      case "import-cost":
        return <ImportCostSummaryTab />;
      case "expenses":
        return <ExpensesReportTab />;
      case "customer-analysis":
        return <CustomerAnalysisTab />;
      case "customer-aging":
        return <CustomerAgingTab />;
      case "supplier-performance":
        return <SupplierPerformanceTab />;
      case "supplier-payable":
        return <SupplierPayableTab />;
      case "customer-receivable":
        return <CustomerReceivableTab />;
      default:
        return <RealTimeDashboard />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports & Analytics</h1>
          <p className="text-muted-foreground">Comprehensive business insights and reporting</p>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => setShowCategories(!showCategories)}
        >
          <Filter className="w-4 h-4 mr-2" />
          {showCategories ? "Hide Categories" : "Show Categories"}
        </Button>
      </div>

      {/* Category Tabs */}
      {showCategories && (
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <Button
              key={category.id}
              variant={activeCategory === category.id ? "default" : "outline"}
              size="sm"
              className={activeCategory === category.id ? category.color : ""}
              onClick={() => handleCategoryChange(category.id)}
            >
              <span className={`w-2 h-2 rounded-full mr-2 ${category.color}`} />
              {category.label}
            </Button>
          ))}
        </div>
      )}

      {/* Sub Tabs - Horizontal Scrollable (hide when only one tab) */}
      {subTabs[activeCategory].length > 1 && (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-1 min-w-max border-b border-border">
            {subTabs[activeCategory].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleSubTabChange(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="mt-4">
        {renderContent()}
      </div>
    </div>
  );
};

export default ReportsAnalytics;
