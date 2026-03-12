"use client";

import { useEffect, useRef } from "react";
import type { CalendarEvent } from "@/types/calendar";
import type { NotificationPreferences } from "@/app/context/NotificationPreferencesContext";
import { notifyUpcomingEvent } from "@/lib/notifyUpcomingEvent";
import { useToast } from "@/app/components/ToastProvider";

type Scheduled = {
  key: string;
  timeoutId: number;
  fireAtMs: number;
};

function buildKey(event: CalendarEvent, minutes: number) {
  return `${event.originalId}|${event.startTime}|${minutes}`;
}

function effectiveReminderMinutes(
  event: CalendarEvent,
  prefs: NotificationPreferences
): number | null {
  if (!prefs.notificationsEnabled) return null;
  if (event.reminderDisabled) return null;
  if (event.reminderMinutes !== null && event.reminderMinutes !== undefined) {
    return event.reminderMinutes;
  }
  return prefs.defaultReminderMinutes;
}

export function useEventReminderScheduler(params: {
  events: CalendarEvent[];
  prefs: NotificationPreferences;
}) {
  const { pushToast } = useToast();
  const firedRef = useRef<Set<string>>(new Set());
  const scheduledRef = useRef<Map<string, Scheduled>>(new Map());

  useEffect(() => {
    const now = Date.now();
    const horizonMs = 24 * 60 * 60 * 1000;
    const end = now + horizonMs;

    const candidates = params.events
      .map((event) => {
        const minutes = effectiveReminderMinutes(event, params.prefs);
        if (minutes === null) return null;
        const startMs = new Date(event.startTime).getTime();
        if (!Number.isFinite(startMs)) return null;
        const fireAtMs = startMs - minutes * 60 * 1000;
        if (fireAtMs < now - 60_000) return null;
        if (fireAtMs > end) return null;
        return { event, minutes, fireAtMs, key: buildKey(event, minutes) };
      })
      .filter(
        (x): x is { event: CalendarEvent; minutes: number; fireAtMs: number; key: string } =>
          x !== null
      )
      .sort((a, b) => a.fireAtMs - b.fireAtMs);

    // Clear timers that are no longer relevant
    const keepKeys = new Set(candidates.map((c) => c.key));
    for (const [key, scheduled] of scheduledRef.current.entries()) {
      if (!keepKeys.has(key)) {
        window.clearTimeout(scheduled.timeoutId);
        scheduledRef.current.delete(key);
      }
    }

    // Schedule any new candidates
    for (const c of candidates) {
      if (firedRef.current.has(c.key)) continue;
      if (scheduledRef.current.has(c.key)) continue;

      const delay = Math.max(0, c.fireAtMs - Date.now());
      // Browsers clamp long timeouts; we keep a 24h horizon anyway.
      const timeoutId = window.setTimeout(async () => {
        if (firedRef.current.has(c.key)) return;
        firedRef.current.add(c.key);
        scheduledRef.current.delete(c.key);
        await notifyUpcomingEvent({
          event: c.event,
          prefs: params.prefs,
          pushToast,
        });
      }, delay);

      scheduledRef.current.set(c.key, { key: c.key, timeoutId, fireAtMs: c.fireAtMs });
    }

    // Light periodic cleanup to avoid memory growth after many weeks of navigation
    const cleanup = window.setTimeout(() => {
      const cutoff = Date.now() - 48 * 60 * 60 * 1000;
      for (const key of firedRef.current) {
        const parts = key.split("|");
        const startIso = parts[1];
        const startMs = new Date(startIso).getTime();
        if (Number.isFinite(startMs) && startMs < cutoff) {
          firedRef.current.delete(key);
        }
      }
    }, 60_000);

    return () => {
      window.clearTimeout(cleanup);
    };
  }, [params.events, params.prefs, pushToast]);
}

