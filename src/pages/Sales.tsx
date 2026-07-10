import { useEffect, useMemo } from "react";
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
import { getSalesHomePath, isAccountantRole, isSalesRole } from "@/utils/auth";

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
  | "receivable-reminders"
  ;

interface TabConfig {
  id: SalesTab;
  label: string;
  icon: React.ElementType;
  description: string;
}

const allTabs: TabConfig[] = [
  { id: "inquiry", label: "Inquiry", icon: MessageSquare, description: "Manage sales inquiries" },
  { id: "quotation", label: "Quotation", icon: FileText, description: "Create & manage quotations" },
  { id: "invoice", label: "Invoice", icon: Receipt, description: "Sales invoices with stock reserve" },
  { id: "returns", label: "Returns", icon: RotateCcw, description: "Process returns" },
  { id: "distributor-aging", label: "Aging Report", icon: Clock, description: "Aging report analysis" },
  { id: "receivable-reminders", label: "Receivables", icon: Bell, description: "Reminders & rescheduling" },
];

const Sales = () => {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();
  const isSalesUser = isSalesRole();
  const isAccountant = isAccountantRole();

  const tabs = useMemo(() => {
    if (isAccountant) {
      return allTabs.filter((t) => t.id === "invoice" || t.id === "returns");
    }
    if (isSalesUser) {
      return allTabs.filter(
        (t) =>
          t.id !== "inquiry" &&
          t.id !== "distributor-aging" &&
          t.id !== "receivable-reminders",
      );
    }
    return allTabs;
  }, [isAccountant, isSalesUser]);

  const defaultTab: SalesTab =
    isSalesUser || isAccountant ? "invoice" : "inquiry";

  const activeTab: SalesTab = tabs.some((t) => t.id === tab)
    ? (tab as SalesTab)
    : defaultTab;

  // Ensure /sales redirects to the default dedicated page.
  useEffect(() => {
    if (!tab) {
      navigate(
        isSalesUser || isAccountant ? getSalesHomePath() : "/sales/inquiry",
        { replace: true },
      );
      return;
    }
    if (
      isSalesUser &&
      (tab === "inquiry" ||
        tab === "distributor-aging" ||
        tab === "receivable-reminders")
    ) {
      navigate(getSalesHomePath(), { replace: true });
      return;
    }
    if (
      isAccountant &&
      tab !== "invoice" &&
      tab !== "returns"
    ) {
      navigate(getSalesHomePath(), { replace: true });
    }
  }, [tab, navigate, isSalesUser, isAccountant]);

  const handleTabChange = (tabId: SalesTab) => navigate(`/sales/${tabId}`);

  const renderContent = () => {
    switch (activeTab) {
      case "inquiry":
        return isSalesUser || isAccountant ? <SalesInvoice /> : <SalesInquiry />;
      case "quotation":
        return isAccountant ? <SalesInvoice /> : <SalesQuotation />;
      case "invoice":
        return <SalesInvoice />;
      case "returns":
        return <SalesReturns />;
      case "distributor-aging":
        return isSalesUser || isAccountant ? <SalesInvoice /> : <DistributorAging />;
      case "receivable-reminders":
        return isSalesUser || isAccountant ? <SalesInvoice /> : <ReceivableReminders />;
      default:
        return isSalesUser || isAccountant ? <SalesInvoice /> : <SalesInquiry />;
    }
  };

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden ml-16">
        <Header />

        {/* Horizontal Scrollable Tab Navigation */}
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

export default Sales;
