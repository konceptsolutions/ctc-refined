import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Plus, Package, Settings, Layers } from "lucide-react";
import { can } from "@/permissions/can";
import { usePermissions } from "@/permissions/PermissionsProvider";

const NAV_ITEMS = [
  { path: "/partentry", label: "Parts Entry", icon: Plus, permission: "page.partentry.entry" },
  { path: "/partentry/itemslist", label: "Items List", icon: Package, permission: "page.partentry.itemslist" },
  { path: "/partentry/attributes", label: "Attributes", icon: Settings, permission: "page.partentry.attributes" },
  { path: "/partentry/models", label: "Models", icon: Layers, permission: "page.partentry.models" },
] as const;

export const PartEntryTopNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const { version } = usePermissions();
  void version;
  const items = NAV_ITEMS.filter((i) => can(i.permission));

  return (
    <div className="bg-card border-b border-border px-4 py-2">
      <div className="flex items-center justify-center gap-6">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all text-xs font-medium",
                currentPath === item.path
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
