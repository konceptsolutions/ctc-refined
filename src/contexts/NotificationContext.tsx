import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: Date;
  read: boolean;
  action?: {
    label: string;
    path?: string;
    onClick?: () => void;
  };
  module?: string;
}

type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  pushEnabled: boolean;
  pushPermission: PushPermission;
  requestPushPermission: () => Promise<boolean>;
  togglePush: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const STORAGE_KEY = 'app-notifications';
const SOUND_PREF_KEY = 'notification-sound-enabled';
const PUSH_PREF_KEY = 'notification-push-enabled';

// Check if browser supports notifications
const isPushSupported = (): boolean => {
  return 'Notification' in window;
};

// Get current permission status
const getPushPermission = (): PushPermission => {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission as PushPermission;
};

// Show browser push notification
const showPushNotification = (title: string, options?: NotificationOptions) => {
  if (!isPushSupported() || Notification.permission !== 'granted') return;
  
  try {
    const notification = new Notification(title, {
      tag: 'app-notification',
      ...options,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    // Auto close after 5 seconds
    setTimeout(() => notification.close(), 5000);
  } catch (error) {
  }
};

// Notification sound using Web Audio API
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create a pleasant notification chime
    const oscillator1 = audioContext.createOscillator();
    const oscillator2 = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator1.connect(gainNode);
    oscillator2.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // First tone
    oscillator1.frequency.setValueAtTime(880, audioContext.currentTime); // A5
    oscillator1.type = 'sine';
    
    // Second tone (harmony)
    oscillator2.frequency.setValueAtTime(1108.73, audioContext.currentTime); // C#6
    oscillator2.type = 'sine';
    
    // Volume envelope
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.05);
    gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.15);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.4);
    
    oscillator1.start(audioContext.currentTime);
    oscillator2.start(audioContext.currentTime);
    oscillator1.stop(audioContext.currentTime + 0.4);
    oscillator2.stop(audioContext.currentTime + 0.4);
    
    // Cleanup
    setTimeout(() => {
      audioContext.close();
    }, 500);
  } catch (error) {
  }
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((n: any) => ({
          ...n,
          timestamp: new Date(n.timestamp),
        }));
      }
    } catch (error) {
    }
    return [];
  });

  const [soundEnabled, setSoundEnabled] = useState(() => {
    const stored = localStorage.getItem(SOUND_PREF_KEY);
    return stored !== 'false';
  });

  const [pushEnabled, setPushEnabled] = useState(() => {
    const stored = localStorage.getItem(PUSH_PREF_KEY);
    return stored === 'true' && getPushPermission() === 'granted';
  });

  const [pushPermission, setPushPermission] = useState<PushPermission>(getPushPermission);

  const isInitialMount = useRef(true);

  // Update push permission status on mount and visibility change
  useEffect(() => {
    const updatePermission = () => {
      const currentPermission = getPushPermission();
      setPushPermission(currentPermission);
      
      // Disable push if permission was revoked
      if (currentPermission !== 'granted' && pushEnabled) {
        setPushEnabled(false);
        localStorage.setItem(PUSH_PREF_KEY, 'false');
      }
    };

    updatePermission();
    
    // Check permission when tab becomes visible
    document.addEventListener('visibilitychange', updatePermission);
    return () => document.removeEventListener('visibilitychange', updatePermission);
  }, [pushEnabled]);

  // Save to localStorage when notifications change
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    
    try {
      const toStore = notifications.slice(0, 50).map(n => ({
        ...n,
        timestamp: n.timestamp.toISOString(),
        action: n.action ? { label: n.action.label, path: n.action.path } : undefined,
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch (error) {
    }
  }, [notifications]);

  // Save sound preference
  useEffect(() => {
    localStorage.setItem(SOUND_PREF_KEY, String(soundEnabled));
  }, [soundEnabled]);

  // Save push preference
  useEffect(() => {
    localStorage.setItem(PUSH_PREF_KEY, String(pushEnabled));
  }, [pushEnabled]);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Request push notification permission
  const requestPushPermission = useCallback(async (): Promise<boolean> => {
    if (!isPushSupported()) {
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission as PushPermission);
      
      if (permission === 'granted') {
        setPushEnabled(true);
        // Show a test notification
        showPushNotification('Notifications Enabled! 🔔', {
          body: 'You will now receive browser notifications from InventoryERP.',
        });
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }, []);

  const togglePush = useCallback(() => {
    if (pushPermission === 'granted') {
      setPushEnabled(prev => !prev);
    } else if (pushPermission === 'default') {
      requestPushPermission();
    }
  }, [pushPermission, requestPushPermission]);

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      read: false,
    };

    setNotifications(prev => [newNotification, ...prev.slice(0, 49)]);

    // Play sound if enabled
    if (soundEnabled) {
      playNotificationSound();
    }

    // Show browser push notification if enabled and page is not focused
    if (pushEnabled && document.hidden) {
      const iconMap: Record<string, string> = {
        success: '✅',
        warning: '⚠️',
        error: '❌',
        info: 'ℹ️',
      };
      
      showPushNotification(`${iconMap[notification.type] || ''} ${notification.title}`, {
        body: notification.message,
        tag: notification.module || 'general',
      });
    }
  }, [soundEnabled, pushEnabled]);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => !prev);
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
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
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

