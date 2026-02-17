import { Plus, FileText, Package, DollarSign, Building2, BarChart3, ChevronRight, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useAppNotifications } from "@/hooks/useAppNotifications";

interface QuickActionItemProps {
  icon: React.ReactNode;
  iconBgColor: string;
  title: string;
  description: string;
  badge?: string;
  onClick?: () => void;
}

const QuickActionItem = ({ icon, iconBgColor, title, description, badge, onClick }: QuickActionItemProps) => (
  <button 
    onClick={onClick}
    className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:shadow-md transition-all duration-200 w-full group"
  >
    <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", iconBgColor)}>
      {icon}
    </div>
    <div className="flex-1 text-left">
      <div className="flex items-center gap-2">
        <span className="font-medium text-foreground">{title}</span>
        {badge && (
          <span className="px-2 py-0.5 bg-success text-success-foreground text-xs font-medium rounded">
            {badge}
          </span>
        )}
      </div>
      <span className="text-sm text-muted-foreground">{description}</span>
    </div>
    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
  </button>
);

export const QuickActions = () => {
  const navigate = useNavigate();
  const { 
    notifyPartCreated, 
    notifyInvoiceCreated, 
    notifyPurchaseOrderCreated,
    notifyStockLow,
    notifyPaymentReceived,
  } = useAppNotifications();

  const actions = [
    {
      icon: <Plus className="w-5 h-5 text-chart-orange" />,
      iconBgColor: "bg-chart-orange/10",
      title: "Add New Part",
      description: "Create a new inventory item",
      onClick: () => {
        navigate('/parts');
        notifyPartCreated('New Item #' + Math.floor(Math.random() * 1000));
      },
    },
    {
      icon: <FileText className="w-5 h-5 text-chart-purple" />,
      iconBgColor: "bg-chart-purple/10",
      title: "Create Purchase Order",
      description: "Start a new procurement",
      badge: "New",
      onClick: () => {
        navigate('/inventory');
        notifyPurchaseOrderCreated('PO-' + Math.floor(Math.random() * 10000), 'Sample Supplier');
      },
    },
    {
      icon: <Package className="w-5 h-5 text-chart-purple" />,
      iconBgColor: "bg-chart-purple/10",
      title: "Manage Kits",
      description: "View and edit kit assemblies",
      onClick: () => {
        navigate('/parts');
      },
    },
    {
      icon: <DollarSign className="w-5 h-5 text-info" />,
      iconBgColor: "bg-info/10",
      title: "Sales & Invoices",
      description: "Manage sales transactions",
      onClick: () => {
        navigate('/sales');
        notifyInvoiceCreated('INV-' + Math.floor(Math.random() * 10000), 1250.00);
      },
    },
    {
      icon: <Building2 className="w-5 h-5 text-chart-purple" />,
      iconBgColor: "bg-chart-purple/10",
      title: "View Suppliers",
      description: "Manage vendor relationships",
      onClick: () => {
        navigate('/manage');
      },
    },
    {
      icon: <BarChart3 className="w-5 h-5 text-chart-blue" />,
      iconBgColor: "bg-chart-blue/10",
      title: "View Reports",
      description: "Analytics and insights",
      onClick: () => {
        navigate('/reports');
      },
    },
    {
      icon: <Bell className="w-5 h-5 text-primary" />,
      iconBgColor: "bg-primary/10",
      title: "Test Notifications",
      description: "Demo notification with sound",
      badge: "Demo",
      onClick: () => {
        const demoNotifications = [
          () => notifyStockLow('Widget Pro X', 5),
          () => notifyPaymentReceived(2500.00, 'ABC Corp'),
          () => notifyInvoiceCreated('INV-' + Math.floor(Math.random() * 10000), 750.00),
          () => notifyPartCreated('Sample Part #' + Math.floor(Math.random() * 100)),
          () => notifyPurchaseOrderCreated('PO-' + Math.floor(Math.random() * 10000), 'Global Supplies'),
        ];
        const randomNotification = demoNotifications[Math.floor(Math.random() * demoNotifications.length)];
        randomNotification();
      },
    },
  ];

  return (
    <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">Quick Actions</h3>
        <p className="text-muted-foreground text-sm">Frequently used shortcuts</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {actions.map((action, index) => (
          <QuickActionItem key={index} {...action} />
        ))}
      </div>
    </div>
  );
};

