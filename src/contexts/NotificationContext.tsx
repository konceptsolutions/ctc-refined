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
let sharedAudioContext: AudioContext | null = null;
let dialerRingWavUrl: string | null = null;

const getSharedAudioContext = () => {
  if (!sharedAudioContext) {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    sharedAudioContext = new Ctx();
  }
  return sharedAudioContext;
};

const writeWavString = (view: DataView, offset: number, value: string) => {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
};

const getDialerRingWavUrl = () => {
  if (dialerRingWavUrl) return dialerRingWavUrl;

  const sampleRate = 44100;
  const durationSec = 3.6;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const bitsPerSample = 16;
  const numChannels = 1;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = totalSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeWavString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeWavString(view, 8, "WAVE");
  writeWavString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeWavString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const bursts: Array<[number, number]> = [
    [0.0, 0.33],
    [0.42, 0.75],
    [1.35, 1.68],
    [1.77, 2.1],
    [2.7, 3.03],
    [3.12, 3.45],
  ];

  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / sampleRate;
    const burst = bursts.find(([start, end]) => t >= start && t <= end);
    let sample = 0;
    if (burst) {
      const [start, end] = burst;
      const attack = Math.min(1, Math.max(0, (t - start) / 0.03));
      const release = Math.min(1, Math.max(0, (end - t) / 0.05));
      const env = Math.min(attack, release);
      const toneA = Math.sin(2 * Math.PI * 440 * t);
      const toneB = Math.sin(2 * Math.PI * 480 * t);
      sample = (toneA + toneB) * 0.42 * env;
    }

    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(
      44 + i * blockAlign,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true,
    );
  }

  const blob = new Blob([buffer], { type: "audio/wav" });
  dialerRingWavUrl = URL.createObjectURL(blob);
  return dialerRingWavUrl;
};

const playHtmlAudioFallback = async () => {
  try {
    const audio = new Audio(getDialerRingWavUrl());
    audio.volume = 1;
    audio.preload = "auto";
    audio.playsInline = true;
    await audio.play();
  } catch {
    // ignore fallback playback failure
  }
};

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
const playNotificationSound = async () => {
  try {
    const audioContext = getSharedAudioContext();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    // Old dialer phone ring style (two-tone, louder and longer).
    // Classic ring approximation around 440Hz + 480Hz.
    const masterGain = audioContext.createGain();
    masterGain.connect(audioContext.destination);
    masterGain.gain.setValueAtTime(0, audioContext.currentTime);

    const scheduleRingBurst = (startAt: number, burstDuration = 0.33) => {
      const oscA = audioContext.createOscillator();
      const oscB = audioContext.createOscillator();
      const burstGain = audioContext.createGain();

      oscA.type = 'square';
      oscB.type = 'square';
      oscA.frequency.setValueAtTime(440, startAt);
      oscB.frequency.setValueAtTime(480, startAt);

      oscA.connect(burstGain);
      oscB.connect(burstGain);
      burstGain.connect(masterGain);

      burstGain.gain.setValueAtTime(0, startAt);
      burstGain.gain.linearRampToValueAtTime(0.9, startAt + 0.03);
      burstGain.gain.linearRampToValueAtTime(0.62, startAt + burstDuration - 0.06);
      burstGain.gain.linearRampToValueAtTime(0, startAt + burstDuration);

      oscA.start(startAt);
      oscB.start(startAt);
      oscA.stop(startAt + burstDuration + 0.02);
      oscB.stop(startAt + burstDuration + 0.02);
    };

    const start = audioContext.currentTime;
    // Ring-ring ... pause ... ring-ring (about 3 seconds total)
    scheduleRingBurst(start + 0.00, 0.33);
    scheduleRingBurst(start + 0.42, 0.33);
    scheduleRingBurst(start + 1.35, 0.33);
    scheduleRingBurst(start + 1.77, 0.33);
    scheduleRingBurst(start + 2.70, 0.33);
    scheduleRingBurst(start + 3.12, 0.33);

    // Keep shared context alive; closing it can break later notifications.
  } catch (error) {
    try {
      if (typeof window !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.([150, 80, 150]);
      }
    } catch {
      // ignore fallback errors
    }
  }
  // Always attempt HTMLAudio as second path for browsers
  // that suppress or inconsistently render WebAudio output.
  await playHtmlAudioFallback();
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

  // Unlock audio on first user interaction to satisfy browser autoplay policies.
  useEffect(() => {
    const unlockAudio = async () => {
      try {
        const audioContext = getSharedAudioContext();
        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }
      } catch {
        // ignore unlock errors
      }
    };

    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, unlockAudio, { passive: true }));
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, unlockAudio));
    };
  }, []);

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
    const dedupeTitle = notification.title.trim().toLowerCase();
    const dedupeMessage = notification.message.trim().toLowerCase();
    const dedupeModule = String(notification.module || "general").trim().toLowerCase();
    const now = Date.now();
    let shouldAddNotification = true;
    const isCriticalStoreApprovedInvoice =
      dedupeModule === "store" &&
      /\binvoice\b/.test(`${dedupeTitle} ${dedupeMessage}`) &&
      /\bapproved\b/.test(`${dedupeTitle} ${dedupeMessage}`);

    const newNotification: Notification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      read: false,
    };

    setNotifications((prev) => {
      const hasDuplicate = prev.some((n) => {
        const sameTitle = n.title.trim().toLowerCase() === dedupeTitle;
        const sameMessage = n.message.trim().toLowerCase() === dedupeMessage;
        const sameModule =
          String(n.module || "general").trim().toLowerCase() === dedupeModule;
        const ageMs = now - new Date(n.timestamp).getTime();
        return sameTitle && sameMessage && sameModule && ageMs < 60 * 60 * 1000;
      });
      if (hasDuplicate) {
        shouldAddNotification = false;
        return prev;
      }
      return [newNotification, ...prev.slice(0, 49)];
    });

    if (!shouldAddNotification) return;

    // Play sound if enabled
    if (soundEnabled || isCriticalStoreApprovedInvoice) {
      void playNotificationSound();
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

