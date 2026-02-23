"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type CalendarPreferences = {
  backgroundUrl: string | null;
  topLeftUrl: string | null;
};

type CalendarPreferencesContextValue = CalendarPreferences & {
  setPreferences: (prefs: CalendarPreferences) => void;
  loading: boolean;
  refresh: () => Promise<void>;
};

const CalendarPreferencesContext = createContext<
  CalendarPreferencesContextValue | undefined
>(undefined);

export function CalendarPreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<CalendarPreferences>({
    backgroundUrl: null,
    topLeftUrl: null,
  });
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await fetch("/api/user/calendar-settings", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as CalendarPreferences;
      setPrefs({
        backgroundUrl: data.backgroundUrl ?? null,
        topLeftUrl: data.topLeftUrl ?? null,
      });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const res = await fetch("/api/user/calendar-settings", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as CalendarPreferences;
        if (cancelled) return;
        setPrefs({
          backgroundUrl: data.backgroundUrl ?? null,
          topLeftUrl: data.topLeftUrl ?? null,
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
    <CalendarPreferencesContext.Provider
      value={{
        backgroundUrl: prefs.backgroundUrl,
        topLeftUrl: prefs.topLeftUrl,
        setPreferences: setPrefs,
        loading,
        refresh,
      }}
    >
      {children}
    </CalendarPreferencesContext.Provider>
  );
}

export function useCalendarPreferences() {
  const ctx = useContext(CalendarPreferencesContext);
  if (!ctx) {
    throw new Error("useCalendarPreferences must be used within CalendarPreferencesProvider");
  }
  return ctx;
}

