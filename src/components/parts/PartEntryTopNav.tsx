import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Plus, Package, Settings, Layers, Search } from "lucide-react";

export const PartEntryTopNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <div className="bg-card border-b border-border px-4 py-2">
      <div className="flex items-center justify-center gap-6">
        <button
          onClick={() => navigate("/partentry")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all text-xs font-medium",
            currentPath === "/partentry"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          <Plus className="w-3.5 h-3.5" />
          Parts Entry
        </button>
        <button
          onClick={() => navigate("/partentry/itemslist")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all text-xs font-medium",
            currentPath === "/partentry/itemslist"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          <Package className="w-3.5 h-3.5" />
          Items List
        </button>
        <button
          onClick={() => navigate("/partentry/attributes")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all text-xs font-medium",
            currentPath === "/partentry/attributes"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          <Settings className="w-3.5 h-3.5" />
          Attributes
        </button>
        <button
          onClick={() => navigate("/partentry/models")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all text-xs font-medium",
            currentPath === "/partentry/models"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          <Layers className="w-3.5 h-3.5" />
          Models
        </button>
        {/* Details Part Search button hidden as requested */}
        {/* <button
          onClick={() => navigate("/partentry/details-search")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all text-xs font-medium",
            currentPath === "/partentry/details-search"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          <Search className="w-3.5 h-3.5" />
          Details Part Search
        </button> */}

      </div>
    </div>
  );
};
