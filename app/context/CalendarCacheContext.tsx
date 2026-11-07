"use client";

import { createContext, useContext } from "react";

const CalendarCacheContext = createContext<string | undefined>(undefined);

export function CalendarCacheProvider({ userId, children }: { userId: string; children?: React.ReactNode }) {
  return <CalendarCacheContext.Provider value={userId}>{children}</CalendarCacheContext.Provider>;
}

export function useCalendarCacheUserId() {
  return useContext(CalendarCacheContext);
}
