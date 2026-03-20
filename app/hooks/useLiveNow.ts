"use client";

import { useEffect, useRef, useState } from "react";

function msUntilNextMinute() {
  const now = Date.now();
  const remainder = now % 60_000;
  return remainder === 0 ? 60_000 : 60_000 - remainder;
}

export function useLiveNow() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const tickTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const clearTickTimeout = () => {
      if (tickTimeoutRef.current !== null) {
        window.clearTimeout(tickTimeoutRef.current);
        tickTimeoutRef.current = null;
      }
    };

    const scheduleAlignedTick = () => {
      clearTickTimeout();
      tickTimeoutRef.current = window.setTimeout(() => {
        setCurrentTime(new Date());
        scheduleAlignedTick();
      }, msUntilNextMinute());
    };

    const syncNow = () => {
      setCurrentTime(new Date());
      scheduleAlignedTick();
    };

    syncNow();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncNow();
      }
    };

    window.addEventListener("focus", syncNow);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTickTimeout();
      window.removeEventListener("focus", syncNow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return currentTime;
}
