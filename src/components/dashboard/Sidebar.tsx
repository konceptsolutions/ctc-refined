import {
  Home,
  Package,
  Boxes,
  DollarSign,
  Tag,
  Settings,
  Settings2,
  Calculator,
  BookOpen,
  ClipboardList,
  Store as StoreIcon,
  Truck,
  ArrowLeftRight,
  UserCircle,
  LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SIDEBAR_MODULE_KEYS } from "@/permissions/catalog";
import { usePermissions } from "@/permissions/PermissionsProvider";

interface SidebarItemProps {
  Icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

const SidebarItem = ({ Icon, label, active, onClick }: SidebarItemProps) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center transition-colors duration-150",
            active
              ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          <Icon className="w-4 h-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="bg-foreground text-background px-3 py-1.5 text-sm font-medium">
        {label}
      </TooltipContent>
    </Tooltip>
  );
};

interface MenuItem {
  Icon: LucideIcon;
  path: string;
  label: string;
  alsoMatch?: string;
}

export const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const { can, version } = usePermissions();

  const isActivePath = (basePath: string, alsoMatch?: string) => {
    if (basePath === "/") return currentPath === "/";
    const match = currentPath === basePath || currentPath.startsWith(`${basePath}/`);
    if (alsoMatch) return match || currentPath === alsoMatch || currentPath.startsWith(`${alsoMatch}/`);
    return match;
  };

  const menuItems: MenuItem[] = [
    { Icon: Home, path: "/", label: "Dashboard" },
    { Icon: Package, path: "/partentry", label: "Part Entry" },
    { Icon: Boxes, path: "/inventory", label: "Inventory Management" },
    { Icon: ArrowLeftRight, path: "/transfer", label: "Transfer" },
    { Icon: StoreIcon, path: "/store", label: "Store" },
    { Icon: Calculator, path: "/pricing-costing", label: "Pricing & Costing" },
    { Icon: DollarSign, path: "/sales", label: "Sales & Distribution" },
    { Icon: Truck, path: "/purchase-import", label: "Purchase Import" },
    { Icon: BookOpen, path: "/accounting", label: "Accounting" },
    { Icon: ClipboardList, path: "/financial-statements", label: "Financial Statements" },
    { Icon: Tag, path: "/vouchers", label: "Vouchers" },
    { Icon: UserCircle, path: "/employees", label: "Employees" },
    { Icon: Settings2, path: "/manage", label: "Manage" },
    { Icon: Settings, path: "/settings/users", label: "Settings" },
  ];

  const visibleMenuItems = menuItems.filter((item) => {
    const moduleKey = SIDEBAR_MODULE_KEYS[item.path];
    return moduleKey ? can(moduleKey) : true;
  });
  // Re-evaluate when permission version changes
  void version;

  return (
    <TooltipProvider delayDuration={0}>
      <aside className="fixed left-0 top-0 h-screen w-16 bg-card border-r border-border flex flex-col items-center py-4 gap-2 z-40">
        {visibleMenuItems.map((item) => (
          <SidebarItem
            key={item.path}
            Icon={item.Icon}
            label={item.label}
            active={isActivePath(item.path, item.alsoMatch)}
            onClick={() => navigate(item.path)}
          />
        ))}
      </aside>
    </TooltipProvider>
  );
};
