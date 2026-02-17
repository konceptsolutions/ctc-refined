import React, { useState } from 'react';
import { Bell, Check, CheckCheck, Trash2, Volume2, VolumeX, X, Info, CheckCircle, AlertTriangle, AlertCircle, BellRing, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNotifications, Notification } from '@/contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

const getNotificationIcon = (type: Notification['type']) => {
  switch (type) {
    case 'success':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Info className="h-4 w-4 text-blue-500" />;
  }
};

const getNotificationBg = (type: Notification['type'], read: boolean) => {
  if (read) return 'bg-background';
  switch (type) {
    case 'success':
      return 'bg-green-500/5';
    case 'warning':
      return 'bg-yellow-500/5';
    case 'error':
      return 'bg-red-500/5';
    default:
      return 'bg-blue-500/5';
  }
};

export const NotificationBell: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
    soundEnabled,
    toggleSound,
    pushEnabled,
    pushPermission,
    requestPushPermission,
    togglePush,
  } = useNotifications();

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    if (notification.action?.path) {
      navigate(notification.action.path);
      setIsOpen(false);
    } else if (notification.action?.onClick) {
      notification.action.onClick();
    }
  };

  const handlePushToggle = async () => {
    if (pushPermission === 'denied') {
      toast.error('Notifications blocked', {
        description: 'Please enable notifications in your browser settings.',
      });
      return;
    }
    
    if (pushPermission === 'default') {
      const granted = await requestPushPermission();
      if (!granted) {
        toast.info('Notifications permission required', {
          description: 'Allow notifications to receive alerts when the app is in background.',
        });
      }
    } else {
      togglePush();
      toast.success(pushEnabled ? 'Push notifications disabled' : 'Push notifications enabled');
    }
  };

  const getPushButtonTitle = () => {
    if (pushPermission === 'unsupported') return 'Browser notifications not supported';
    if (pushPermission === 'denied') return 'Notifications blocked - enable in browser settings';
    if (pushPermission === 'default') return 'Enable browser notifications';
    return pushEnabled ? 'Disable browser notifications' : 'Enable browser notifications';
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button 
          data-notification-bell
          className="w-10 h-10 rounded-lg hover:bg-muted flex items-center justify-center transition-colors relative group"
        >
          <Bell className={cn(
            "w-5 h-5 transition-colors",
            unreadCount > 0 ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
          )} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-1 animate-pulse">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      
      <PopoverContent className="w-80 sm:w-96 p-0" align="end" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">
                {unreadCount} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Push notification toggle */}
            {pushPermission !== 'unsupported' && (
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-7 w-7",
                  pushPermission === 'denied' && "opacity-50 cursor-not-allowed"
                )}
                onClick={handlePushToggle}
                title={getPushButtonTitle()}
                disabled={pushPermission === 'denied'}
              >
                {pushEnabled && pushPermission === 'granted' ? (
                  <BellRing className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={toggleSound}
              title={soundEnabled ? 'Mute notifications' : 'Unmute notifications'}
            >
              {soundEnabled ? (
                <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>
            {notifications.length > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={markAllAsRead}
                  title="Mark all as read"
                >
                  <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:text-destructive"
                  onClick={clearAll}
                  title="Clear all"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <ScrollArea className="max-h-[400px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                We'll notify you when something happens
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "p-3 hover:bg-muted/50 transition-colors cursor-pointer relative group",
                    getNotificationBg(notification.type, notification.read)
                  )}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex gap-3">
                    <div className="shrink-0 mt-0.5">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn(
                          "text-sm line-clamp-1",
                          !notification.read && "font-semibold"
                        )}>
                          {notification.title}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeNotification(notification.id);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-muted-foreground/70">
                          {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
                        </span>
                        {notification.action && (
                          <span className="text-[10px] text-primary font-medium">
                            {notification.action.label} →
                          </span>
                        )}
                      </div>
                    </div>
                    {!notification.read && (
                      <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-primary rounded-full" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
