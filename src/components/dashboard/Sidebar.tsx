import { useEffect, useState } from "react";
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
  PanelLeftClose,
  PanelLeftOpen,
  LucideIcon,
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
import { AppFooter } from "@/components/dashboard/AppFooter";

const SIDEBAR_EXPANDED_KEY = "sidebar-expanded";
const SIDEBAR_WIDTH_COLLAPSED = "4rem";
const SIDEBAR_WIDTH_EXPANDED = "14rem";

interface SidebarItemProps {
  Icon: LucideIcon;
  label: string;
  active?: boolean;
  expanded: boolean;
  onClick?: () => void;
}

const SidebarItem = ({ Icon, label, active, expanded, onClick }: SidebarItemProps) => {
  const button = (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl flex items-center transition-colors duration-150",
        expanded ? "w-full h-10 px-3 gap-3 justify-start" : "w-9 h-9 justify-center",
        active
          ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      )}
      aria-label={label}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {expanded && (
        <span className="text-sm font-medium truncate">{label}</span>
      )}
    </button>
  );

  if (expanded) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        side="right"
        className="bg-foreground text-background px-3 py-1.5 text-sm font-medium"
      >
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

function readExpandedPreference(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_EXPANDED_KEY);
    const expanded = stored === "true";
    document.documentElement.style.setProperty(
      "--app-sidebar-width",
      expanded ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED
    );
    return expanded;
  } catch {
    return false;
  }
}

export const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const { can, version } = usePermissions();
  const [expanded, setExpanded] = useState(readExpandedPreference);

  useEffect(() => {
    const width = expanded ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED;
    document.documentElement.style.setProperty("--app-sidebar-width", width);
    try {
      localStorage.setItem(SIDEBAR_EXPANDED_KEY, String(expanded));
    } catch {
      /* ignore */
    }
  }, [expanded]);

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

  const ToggleIcon = expanded ? PanelLeftClose : PanelLeftOpen;

  return (
    <TooltipProvider delayDuration={0}>
      <>
      <aside
        className={cn(
          "fixed left-0 top-0 h-screen max-h-screen overflow-hidden bg-card border-r border-border flex flex-col z-40 transition-[width] duration-200 ease-in-out",
          expanded ? "w-56 px-2" : "w-16 items-center px-0"
        )}
      >
        <nav
          className={cn(
            "sidebar-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-4 flex flex-col gap-1.5",
            expanded ? "items-stretch pr-0.5" : "items-center"
          )}
        >
          {visibleMenuItems.map((item) => (
            <div key={item.path} className="shrink-0 w-full flex justify-center">
              <SidebarItem
                Icon={item.Icon}
                label={item.label}
                expanded={expanded}
                active={isActivePath(item.path, item.alsoMatch)}
                onClick={() => navigate(item.path)}
              />
            </div>
          ))}
        </nav>

        <div
          className={cn(
            "py-3 border-t border-border shrink-0 bg-card",
            expanded ? "px-0" : "flex justify-center"
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className={cn(
                  "rounded-xl flex items-center transition-colors duration-150 text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  expanded ? "w-full h-10 px-3 gap-3 justify-start" : "w-9 h-9 justify-center"
                )}
                aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
                aria-expanded={expanded}
              >
                <ToggleIcon className="w-4 h-4 shrink-0" />
                {expanded && (
                  <span className="text-sm font-medium truncate">Collapse</span>
                )}
              </button>
            </TooltipTrigger>
            {!expanded && (
              <TooltipContent
                side="right"
                className="bg-foreground text-background px-3 py-1.5 text-sm font-medium"
              >
                Expand menu
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </aside>
      <AppFooter />
      </>
    </TooltipProvider>
  );
};
