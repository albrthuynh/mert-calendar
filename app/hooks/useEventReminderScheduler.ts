"use client";

import { useEffect, useRef } from "react";
import type { CalendarEvent } from "@/types/calendar";
import type { NotificationPreferences } from "@/app/context/NotificationPreferencesContext";
import { notifyUpcomingEvent } from "@/lib/notifyUpcomingEvent";

type Scheduled = {
  key: string;
  timeoutId: number;
  fireAtMs: number;
};

type Candidate = {
  event: CalendarEvent;
  minutes: number;
  fireAtMs: number;
  key: string;
};

const HORIZON_MS = 24 * 60 * 60 * 1000;
const RECONCILE_INTERVAL_MS = 60_000;
const LATE_FIRE_WINDOW_MS = 30 * 60 * 1000;
const SETTLED_RETENTION_MS = 48 * 60 * 60 * 1000;

function buildKey(event: CalendarEvent, minutes: number) {
  return `${event.originalId}|${event.startTime}|${minutes}`;
}

function isSameLocalDay(targetMs: number, referenceMs: number) {
  const target = new Date(targetMs);
  const reference = new Date(referenceMs);
  return (
    target.getFullYear() === reference.getFullYear() &&
    target.getMonth() === reference.getMonth() &&
    target.getDate() === reference.getDate()
  );
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
  const settledRef = useRef<Set<string>>(new Set());
  const scheduledRef = useRef<Map<string, Scheduled>>(new Map());

  useEffect(() => {
    const getCandidates = (nowMs: number): Candidate[] => {
      const end = nowMs + HORIZON_MS;
      return params.events
        .map((event) => {
          const minutes = effectiveReminderMinutes(event, params.prefs);
          if (minutes === null) return null;
          const startMs = new Date(event.startTime).getTime();
          if (!Number.isFinite(startMs)) return null;
          if (!isSameLocalDay(startMs, nowMs)) return null;
          const fireAtMs = startMs - minutes * 60 * 1000;
          if (fireAtMs > end) return null;
          return { event, minutes, fireAtMs, key: buildKey(event, minutes) };
        })
        .filter((x): x is Candidate => x !== null)
        .sort((a, b) => a.fireAtMs - b.fireAtMs);
    };

    const maybeDeliverReminder = async (candidate: Candidate) => {
      if (settledRef.current.has(candidate.key)) return;

      const latenessMs = Date.now() - candidate.fireAtMs;
      if (latenessMs > LATE_FIRE_WINDOW_MS) {
        settledRef.current.add(candidate.key);
        return;
      }

      settledRef.current.add(candidate.key);
      await notifyUpcomingEvent({
        event: candidate.event,
        prefs: params.prefs,
      });
    };

    const pruneSettled = (cutoffMs: number) => {
      for (const key of settledRef.current) {
        const parts = key.split("|");
        const startIso = parts[1];
        const startMs = new Date(startIso).getTime();
        if (Number.isFinite(startMs) && startMs < cutoffMs) {
          settledRef.current.delete(key);
        }
      }
    };

    const reconcile = () => {
      const now = Date.now();
      const candidates = getCandidates(now);
      const keepKeys = new Set(candidates.map((c) => c.key));

      for (const [key, scheduled] of scheduledRef.current.entries()) {
        if (!keepKeys.has(key)) {
          window.clearTimeout(scheduled.timeoutId);
          scheduledRef.current.delete(key);
        }
      }

      for (const candidate of candidates) {
        if (settledRef.current.has(candidate.key)) continue;

        if (candidate.fireAtMs <= now) {
          const existing = scheduledRef.current.get(candidate.key);
          if (existing) {
            window.clearTimeout(existing.timeoutId);
            scheduledRef.current.delete(candidate.key);
          }
          void maybeDeliverReminder(candidate);
          continue;
        }

        if (scheduledRef.current.has(candidate.key)) continue;

        const delay = candidate.fireAtMs - now;
        const timeoutId = window.setTimeout(() => {
          scheduledRef.current.delete(candidate.key);
          void maybeDeliverReminder(candidate);
        }, delay);

        scheduledRef.current.set(candidate.key, {
          key: candidate.key,
          timeoutId,
          fireAtMs: candidate.fireAtMs,
        });
      }

      pruneSettled(now - SETTLED_RETENTION_MS);
    };

    reconcile();

    const intervalId = window.setInterval(reconcile, RECONCILE_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reconcile();
      }
    };

    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [params.events, params.prefs]);

  useEffect(() => {
    return () => {
      for (const scheduled of scheduledRef.current.values()) {
        window.clearTimeout(scheduled.timeoutId);
      }
      scheduledRef.current.clear();
    };
  }, []);
}
