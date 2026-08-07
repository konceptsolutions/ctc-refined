import { useEffect } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { cn } from "@/lib/utils";
import { useNavigate, useParams } from "react-router-dom";
import {
  FileText,
  RotateCcw,
  Clock,
  Bell,
  MessageSquare,
  Receipt,
} from "lucide-react";
import { usePermissions } from "@/permissions/PermissionsProvider";

// Sales sub-modules
import { SalesInquiry } from "@/components/sales/SalesInquiry";
import { SalesQuotation } from "@/components/sales/SalesQuotation";
import { SalesInvoice } from "@/components/sales/SalesInvoice";
import { SalesReturns } from "@/components/sales/SalesReturns";
import { DistributorAging } from "@/components/sales/DistributorAging";
import { ReceivableReminders } from "@/components/sales/ReceivableReminders";

type SalesTab =
  | "inquiry"
  | "quotation"
  | "invoice"
  | "returns"
  | "distributor-aging"
  | "receivable-reminders";

interface TabConfig {
  id: SalesTab;
  label: string;
  icon: React.ElementType;
  description: string;
  permission: string;
}

const allTabs: TabConfig[] = [
  { id: "inquiry", label: "Inquiry", icon: MessageSquare, description: "Manage sales inquiries", permission: "page.sales.inquiry" },
  { id: "quotation", label: "Quotation", icon: FileText, description: "Create & manage quotations", permission: "page.sales.quotation" },
  { id: "invoice", label: "Invoice", icon: Receipt, description: "Sales invoices with stock reserve", permission: "page.sales.invoice" },
  { id: "returns", label: "Returns", icon: RotateCcw, description: "Process returns", permission: "page.sales.returns" },
  { id: "distributor-aging", label: "Aging Report", icon: Clock, description: "Aging report analysis", permission: "page.sales.distributor-aging" },
  { id: "receivable-reminders", label: "Receivables", icon: Bell, description: "Reminders & rescheduling", permission: "page.sales.receivable-reminders" },
];

const Sales = () => {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();

  const { can } = usePermissions();
  const tabs = allTabs.filter((t) => can(t.permission));

  const defaultTab: SalesTab = (tabs[0]?.id as SalesTab) || "invoice";

  const activeTab: SalesTab = tabs.some((t) => t.id === tab)
    ? (tab as SalesTab)
    : defaultTab;

  useEffect(() => {
    if (!tabs.length) {
      navigate("/", { replace: true });
      return;
    }
    if (!tab || !tabs.some((t) => t.id === tab)) {
      navigate(`/sales/${defaultTab}`, { replace: true });
    }
  }, [tab, navigate, tabs, defaultTab]);

  const handleTabChange = (tabId: SalesTab) => navigate(`/sales/${tabId}`);

  const renderContent = () => {
    switch (activeTab) {
      case "inquiry":
        return <SalesInquiry />;
      case "quotation":
        return <SalesQuotation />;
      case "invoice":
        return <SalesInvoice />;
      case "returns":
        return <SalesReturns />;
      case "distributor-aging":
        return <DistributorAging />;
      case "receivable-reminders":
        return <ReceivableReminders />;
      default:
        return <SalesInvoice />;
    }
  };

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden ml-16">
        <Header />

        <div className="bg-card border-b border-border relative z-10">
          <div className="px-4 py-2 overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-2 min-w-max">
              {tabs.map((tabItem) => {
                const Icon = tabItem.icon;
                return (
                  <button
                    key={tabItem.id}
                    onClick={() => handleTabChange(tabItem.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 text-xs font-medium whitespace-nowrap group",
                      activeTab === tabItem.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tabItem.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <main className="flex-1 p-4 overflow-auto">
          <div className="animate-fade-in">{renderContent()}</div>
        </main>
      </div>
    </div>
  );
};

export default Sales;
