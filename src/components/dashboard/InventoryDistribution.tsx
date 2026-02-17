import { ChevronRight, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useInventoryStats } from "@/hooks/useInventoryData";
import { Button } from "@/components/ui/button";

interface DistributionItem {
  label: string;
  value: number;
  color: string;
  path: string;
}

export const InventoryDistribution = () => {
  const navigate = useNavigate();
  const { partsCount, categoriesCount, kitsCount, suppliersCount, loading, refresh } = useInventoryStats();

  const maxValue = Math.max(partsCount, categoriesCount, kitsCount, suppliersCount, 1);

  const items: DistributionItem[] = [
    { label: "Parts", value: partsCount, color: "bg-chart-orange", path: "/parts" },
    { label: "Categories", value: categoriesCount, color: "bg-chart-blue", path: "/inventory" },
    { label: "Kits", value: kitsCount, color: "bg-info", path: "/parts" },
    { label: "Suppliers", value: suppliersCount, color: "bg-chart-green", path: "/manage" },
  ];

  const handleManageCategories = () => {
    navigate("/inventory");
  };

  const handleItemClick = (path: string) => {
    navigate(path);
  };

  return (
    <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Inventory Distribution</h3>
          <p className="text-muted-foreground text-sm">Items by category</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={refresh}
            disabled={loading}
            className="h-8 w-8"
            title="Refresh counts"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <button 
            onClick={handleManageCategories}
            className="text-primary text-sm font-medium hover:underline flex items-center gap-1"
          >
            Manage Categories
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={index} className="space-y-2 w-full">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <span className="text-sm font-medium text-muted-foreground animate-pulse">...</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-muted rounded-full animate-pulse" style={{ width: '20%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          items.map((item, index) => (
            <button 
              key={index} 
              className="space-y-2 w-full text-left group hover:opacity-80 transition-opacity"
              onClick={() => handleItemClick(item.path)}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground group-hover:text-primary transition-colors">{item.label}</span>
                <span className="text-sm font-medium text-foreground">{item.value.toLocaleString()}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${item.color}`}
                  style={{ width: `${Math.max((item.value / maxValue) * 100, 2)}%` }}
                />
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
