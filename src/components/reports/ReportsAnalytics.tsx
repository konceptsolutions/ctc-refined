import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Filter
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
    { id: "sales-report", label: "Sales Report", icon: FileText },
  ],
  sales: [
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
  ],
  analytics: [
    { id: "customer-analysis", label: "Customer Analysis", icon: Users },
    { id: "customer-aging", label: "Customer/Distributor Aging", icon: Clock },
    { id: "supplier-performance", label: "Supplier Performance", icon: Truck },
  ],
};

const ReportsAnalytics = () => {
  const [activeCategory, setActiveCategory] = useState<CategoryType>("overview");
  const [activeSubTab, setActiveSubTab] = useState<string>("dashboard");
  const [showCategories, setShowCategories] = useState(true);

  const handleCategoryChange = (category: CategoryType) => {
    setActiveCategory(category);
    setActiveSubTab(subTabs[category][0].id);
  };

  const renderContent = () => {
    switch (activeSubTab) {
      case "dashboard":
        return <RealTimeDashboard />;
      case "sales-report":
        return <SalesReportTab />;
      case "periodic-sales":
        return <PeriodicSalesTab />;
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

      {/* Sub Tabs - Horizontal Scrollable */}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-1 min-w-max border-b border-border">
          {subTabs[activeCategory].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
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

      {/* Content */}
      <div className="mt-4">
        {renderContent()}
      </div>
    </div>
  );
};

export default ReportsAnalytics;
