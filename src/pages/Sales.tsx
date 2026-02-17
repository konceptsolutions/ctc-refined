import { useEffect } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { cn } from "@/lib/utils";
import { useNavigate, useParams } from "react-router-dom";
import {
  DollarSign,
  FileText,
  RotateCcw,
  Clock,
  Bell,
  Truck,
  MessageSquare,
  Receipt,
} from "lucide-react";

// Sales sub-modules
import { CustomerPriceStructures } from "@/components/sales/CustomerPriceStructures";
import { SalesInquiry } from "@/components/sales/SalesInquiry";
import { SalesQuotation } from "@/components/sales/SalesQuotation";
import { SalesInvoice } from "@/components/sales/SalesInvoice";
import { SalesReturns } from "@/components/sales/SalesReturns";
import { DistributorAging } from "@/components/sales/DistributorAging";
import { ReceivableReminders } from "@/components/sales/ReceivableReminders";
import { DeliveryChallan } from "@/components/sales/DeliveryChallan";

type SalesTab =
  | "inquiry"
  | "price-structures"
  | "quotation"
  | "invoice"
  | "returns"
  | "distributor-aging"
  | "receivable-reminders"
  | "delivery-challan";

interface TabConfig {
  id: SalesTab;
  label: string;
  icon: React.ElementType;
  description: string;
}

const tabs: TabConfig[] = [
  { id: "inquiry", label: "Inquiry", icon: MessageSquare, description: "Manage sales inquiries" },
  { id: "quotation", label: "Quotation", icon: FileText, description: "Create & manage quotations" },
  { id: "invoice", label: "Invoice", icon: Receipt, description: "Sales invoices with stock reserve" },
  { id: "returns", label: "Returns", icon: RotateCcw, description: "Process returns" },
  { id: "delivery-challan", label: "Delivery", icon: Truck, description: "Dispatch & confirmation" },
  { id: "price-structures", label: "Pricing", icon: DollarSign, description: "Retail / Wholesale / Market pricing" },
  { id: "distributor-aging", label: "Aging Report", icon: Clock, description: "Aging report analysis" },
  { id: "receivable-reminders", label: "Receivables", icon: Bell, description: "Reminders & rescheduling" },
];

const Sales = () => {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();

  const activeTab: SalesTab = tabs.some((t) => t.id === tab)
    ? (tab as SalesTab)
    : "inquiry";

  // Ensure /sales redirects to the default dedicated page.
  useEffect(() => {
    if (!tab) navigate("/sales/inquiry", { replace: true });
  }, [tab, navigate]);

  const handleTabChange = (tabId: SalesTab) => navigate(`/sales/${tabId}`);

  const renderContent = () => {
    switch (activeTab) {
      case "inquiry":
        return <SalesInquiry />;
      case "price-structures":
        return <CustomerPriceStructures />;
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
      case "delivery-challan":
        return <DeliveryChallan />;
      default:
        return <SalesInquiry />;
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
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 text-xs font-medium whitespace-nowrap group",
                      activeTab === tab.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
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
