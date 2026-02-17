import { FileText, Package, Check, AlertTriangle, DollarSign, Bell, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications, Notification } from "@/contexts/NotificationContext";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

const getActivityIcon = (notification: Notification) => {
  const type = notification.type;
  const module = notification.module?.toLowerCase() || '';
  const title = notification.title.toLowerCase();

  if (title.includes('purchase order') || title.includes('po-')) {
    return { icon: <FileText className="w-4 h-4 text-chart-orange" />, bg: "bg-chart-orange/10" };
  }
  if (title.includes('part') || title.includes('stock') || title.includes('inventory')) {
    return { icon: <Package className="w-4 h-4 text-chart-purple" />, bg: "bg-chart-purple/10" };
  }
  if (title.includes('order') && (title.includes('complete') || title.includes('received'))) {
    return { icon: <Check className="w-4 h-4 text-success" />, bg: "bg-success/10" };
  }
  if (type === 'warning' || title.includes('low stock') || title.includes('alert')) {
    return { icon: <AlertTriangle className="w-4 h-4 text-warning" />, bg: "bg-warning/10" };
  }
  if (title.includes('payment') || title.includes('invoice') || module === 'sales') {
    return { icon: <DollarSign className="w-4 h-4 text-info" />, bg: "bg-info/10" };
  }
  if (type === 'success') {
    return { icon: <Check className="w-4 h-4 text-success" />, bg: "bg-success/10" };
  }
  if (type === 'error') {
    return { icon: <AlertTriangle className="w-4 h-4 text-destructive" />, bg: "bg-destructive/10" };
  }
  
  return { icon: <Bell className="w-4 h-4 text-primary" />, bg: "bg-primary/10" };
};

const defaultActivities: {
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  module: string;
  timestamp: Date;
}[] = [];

export const RecentActivity = () => {
  const { notifications, markAsRead } = useNotifications();
  const navigate = useNavigate();

  // Use real notifications if available, otherwise show defaults
  const displayActivities = notifications.length > 0 
    ? notifications.slice(0, 6).map(n => ({
        ...n,
        message: n.message,
      }))
    : defaultActivities.map((d, i) => ({
        id: `default-${i}`,
        ...d,
        read: true,
      }));

  const handleActivityClick = (activity: any) => {
    if (activity.id && !activity.id.startsWith('default-')) {
      markAsRead(activity.id);
    }
    if (activity.action?.path) {
      navigate(activity.action.path);
    }
  };

  const handleViewAll = () => {
    // Open notification panel by simulating click on notification bell
    const bellButton = document.querySelector('[data-notification-bell]');
    if (bellButton instanceof HTMLButtonElement) {
      bellButton.click();
    }
  };

  return (
    <div className="bg-card rounded-xl p-6 border border-border shadow-sm h-fit">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Recent Activity</h3>
          <p className="text-muted-foreground text-sm">Latest updates</p>
        </div>
        <button 
          onClick={handleViewAll}
          className="text-primary text-sm font-medium hover:underline"
        >
          View All
        </button>
      </div>

      <div className="space-y-4">
        {displayActivities.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            No recent activity
          </div>
        ) : (
          displayActivities.map((activity, index) => {
            const { icon, bg } = getActivityIcon(activity as Notification);
            const timeAgo = formatDistanceToNow(activity.timestamp, { addSuffix: false });
            
            return (
              <button 
                key={activity.id || index} 
                onClick={() => handleActivityClick(activity)}
                className={cn(
                  "flex items-start gap-3 w-full text-left rounded-lg p-2 -m-2 transition-colors",
                  "hover:bg-muted/50",
                  !activity.read && "bg-primary/5"
                )}
              >
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", bg)}>
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground text-sm">{activity.title}</p>
                    {!activity.read && (
                      <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs truncate">{activity.message}</p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo} ago</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
