import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { cn } from "@/lib/utils";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { TransferIn } from "@/components/transfer/TransferIn";
import { TransferOut } from "@/components/transfer/TransferOut";

type TransferTab = "transfer-in" | "transfer-out";

interface TabConfig {
  id: TransferTab;
  label: string;
  icon: React.ElementType;
}

const tabs: TabConfig[] = [
  { id: "transfer-in", label: "Transfer In", icon: ArrowDownToLine },
  { id: "transfer-out", label: "Transfer Out", icon: ArrowUpFromLine },
];

const Transfer = () => {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();

  const activeTab: TransferTab = tabs.some((t) => t.id === tab)
    ? (tab as TransferTab)
    : "transfer-in";

  useEffect(() => {
    if (!tab) navigate("/transfer/transfer-in", { replace: true });
  }, [tab, navigate]);

  const handleTabChange = (tabId: TransferTab) => navigate(`/transfer/${tabId}`);

  const renderContent = () => {
    switch (activeTab) {
      case "transfer-in":
        return <TransferIn />;
      case "transfer-out":
        return <TransferOut />;
      default:
        return <TransferIn />;
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
              {tabs.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleTabChange(item.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 text-xs font-medium whitespace-nowrap",
                      activeTab === item.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
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

export default Transfer;
