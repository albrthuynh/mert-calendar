"use client";

import { useEffect } from "react";
import { eventsVersionChanged, invalidateEventsCache } from "@/lib/calendarDataCache";

const POLL_INTERVAL_MS = 60 * 1000;
const IDLE_TIMEOUT_MS = 2 * 60 * 1000;

export function useCalendarEventRefresh(
  refreshEvents: (options?: { force?: boolean }) => Promise<void>
) {
  useEffect(() => {
    let lastActivityAt = Date.now();
    let lastCheckAt: number | null = null;
    let checkInFlight = false;
    let disposed = false;

    const checkForEventChanges = async () => {
      const now = Date.now();
      if (
        disposed || checkInFlight || document.visibilityState !== "visible" ||
        now - lastActivityAt >= IDLE_TIMEOUT_MS ||
        (lastCheckAt !== null && now - lastCheckAt < POLL_INTERVAL_MS)
      ) return;

      lastCheckAt = now;
      checkInFlight = true;
      try {
        if (await eventsVersionChanged() && !disposed) {
          invalidateEventsCache();
          await refreshEvents({ force: true });
        }
      } catch {
        // A failed freshness check should leave the current calendar visible.
      } finally {
        checkInFlight = false;
      }
    };

    const handleActivity = () => {
      lastActivityAt = Date.now();
      void checkForEventChanges();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") handleActivity();
    };
    const handleEventsUpdated = () => {
      invalidateEventsCache();
      void refreshEvents({ force: true }).catch(() => {
        // Preserve the current view if refreshing after a local update fails.
      });
    };

    // Unattended tabs must stop querying so Neon can suspend its compute.
    void checkForEventChanges();
    const interval = window.setInterval(checkForEventChanges, POLL_INTERVAL_MS);
    window.addEventListener("focus", handleActivity);
    window.addEventListener("pointerdown", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("wheel", handleActivity, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("mert-calendar:events-updated", handleEventsUpdated);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", handleActivity);
      window.removeEventListener("pointerdown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("wheel", handleActivity);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("mert-calendar:events-updated", handleEventsUpdated);
    };
  }, [refreshEvents]);
}
