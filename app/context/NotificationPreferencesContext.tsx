"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type NotificationPreferences = {
  notificationsEnabled: boolean;
  defaultReminderMinutes: number;
  notificationSoundEnabled: boolean;
  notificationSound: string | null;
  notificationVolume: number; // 0-100
};

type NotificationPreferencesContextValue = NotificationPreferences & {
  setPreferences: (prefs: NotificationPreferences) => void;
  loading: boolean;
  refresh: () => Promise<void>;
};

const NotificationPreferencesContext = createContext<
  NotificationPreferencesContextValue | undefined
>(undefined);

const DEFAULT_PREFS: NotificationPreferences = {
  notificationsEnabled: false,
  defaultReminderMinutes: 10,
  notificationSoundEnabled: true,
  notificationSound: "beep",
  notificationVolume: 80,
};

export function NotificationPreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await fetch("/api/user/notification-settings", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Partial<NotificationPreferences>;
      setPrefs({
        notificationsEnabled: data.notificationsEnabled ?? DEFAULT_PREFS.notificationsEnabled,
        defaultReminderMinutes:
          typeof data.defaultReminderMinutes === "number"
            ? data.defaultReminderMinutes
            : DEFAULT_PREFS.defaultReminderMinutes,
        notificationSoundEnabled:
          data.notificationSoundEnabled ?? DEFAULT_PREFS.notificationSoundEnabled,
        notificationSound:
          data.notificationSound === undefined ? DEFAULT_PREFS.notificationSound : data.notificationSound,
        notificationVolume:
          typeof data.notificationVolume === "number"
            ? data.notificationVolume
            : DEFAULT_PREFS.notificationVolume,
      });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const res = await fetch("/api/user/notification-settings", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Partial<NotificationPreferences>;
        if (cancelled) return;
        setPrefs({
          notificationsEnabled: data.notificationsEnabled ?? DEFAULT_PREFS.notificationsEnabled,
          defaultReminderMinutes:
            typeof data.defaultReminderMinutes === "number"
              ? data.defaultReminderMinutes
              : DEFAULT_PREFS.defaultReminderMinutes,
          notificationSoundEnabled:
            data.notificationSoundEnabled ?? DEFAULT_PREFS.notificationSoundEnabled,
          notificationSound:
            data.notificationSound === undefined
              ? DEFAULT_PREFS.notificationSound
              : (data.notificationSound as string | null),
          notificationVolume:
            typeof data.notificationVolume === "number"
              ? data.notificationVolume
              : DEFAULT_PREFS.notificationVolume,
        });
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <NotificationPreferencesContext.Provider
      value={{
        ...prefs,
        setPreferences: setPrefs,
        loading,
        refresh,
      }}
    >
      {children}
    </NotificationPreferencesContext.Provider>
  );
}

export function useNotificationPreferences() {
  const ctx = useContext(NotificationPreferencesContext);
  if (!ctx) {
    throw new Error(
      "useNotificationPreferences must be used within NotificationPreferencesProvider"
    );
  }
  return ctx;
}

