import {
  Home,
  Package,
  Boxes,
  DollarSign,
  Tag,
  BarChart3,
  Settings,
  Settings2,
  Calculator,
  BookOpen,
  ClipboardList,
  Store as StoreIcon,
  Truck,
  BookMarked,
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
import { getUserRole, isAccountantRole, isAdminRole, isManagerRole, isSalesRole, isStoreUserRole, ACCOUNTANT_ALLOWED_PATHS, MANAGER_ALLOWED_PATHS, SALES_ALLOWED_PATHS } from "@/utils/auth";

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
    // { Icon: BookMarked, path: "/docs", label: "Documentation" },
    // { Icon: BarChart3, path: "/reports", label: "Reports" },
    { Icon: Settings, path: "/settings/users", label: "Settings" },
  ];
  const isStoreUser = getUserRole() === "store" || isStoreUserRole();
  const isManager = isManagerRole();
  const isAccountant = isAccountantRole();
  const isSales = isSalesRole();
  const isAdmin = isAdminRole();
  const visibleMenuItems = isStoreUser
    ? menuItems.filter((item) => item.path === "/inventory" || item.path === "/store")
    : isManager
      ? menuItems.filter((item) =>
          (MANAGER_ALLOWED_PATHS as readonly string[]).includes(item.path),
        )
      : isAccountant
        ? menuItems.filter((item) =>
            (ACCOUNTANT_ALLOWED_PATHS as readonly string[]).includes(item.path),
          )
        : isSales
          ? menuItems.filter((item) =>
              (SALES_ALLOWED_PATHS as readonly string[]).includes(item.path),
            )
          : isAdmin
            ? menuItems
            : menuItems.filter((item) => item.path !== "/settings");

  return (
    <aside className="w-16 bg-card border-r border-border flex flex-col items-center py-4 h-screen fixed left-0 top-0 z-50">
      {/* Logo */}
      <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center mb-4 shadow-md shadow-primary/20">
        <Package className="w-5 h-5 text-primary-foreground" />
      </div>

      {/* Navigation Items - Centered */}
      <nav className="flex-1 flex flex-col items-center justify-center gap-0.5">
        <TooltipProvider delayDuration={200}>
          {visibleMenuItems.map((item, index) => (
            <div
              key={index}
              className="h-11 w-16 flex items-center justify-center"
            >
              <SidebarItem
                Icon={item.Icon}
                label={item.label}
                active={isActivePath(item.path, item.alsoMatch)}
                onClick={() => navigate(item.path)}
              />
            </div>
          ))}
        </TooltipProvider>
      </nav>
    </aside>
  );
};
