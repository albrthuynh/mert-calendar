"use client";

import { useEffect, useRef } from "react";
import type { Todo } from "@/types/calendar";
import type { NotificationPreferences } from "@/app/context/NotificationPreferencesContext";
import { notifyUpcomingTodo } from "@/lib/notifyUpcomingTodo";

type Scheduled = {
  key: string;
  timeoutId: number;
  fireAtMs: number;
};

type Candidate = {
  todo: Todo;
  minutes: number;
  fireAtMs: number;
  key: string;
};

const HORIZON_MS = 24 * 60 * 60 * 1000;
const RECONCILE_INTERVAL_MS = 60_000;
const LATE_FIRE_WINDOW_MS = 30 * 60 * 1000;
const SETTLED_RETENTION_MS = 48 * 60 * 60 * 1000;

function buildKey(todo: Todo, minutes: number) {
  return `${todo.id}|${todo.dueDate ?? todo.taskDate}|${minutes}`;
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

function computeFireTimeMs(todo: Todo, prefs: NotificationPreferences): number | null {
  if (!prefs.notificationsEnabled) return null;
  if (!todo.dueDate) return null;

  const dueMs = new Date(todo.dueDate).getTime();
  if (!Number.isFinite(dueMs)) return null;

  const minutes = prefs.defaultReminderMinutes;
  const fireAtMs = dueMs - minutes * 60 * 1000;
  return fireAtMs;
}

export function useTodoReminderScheduler(params: {
  todos: Todo[];
  prefs: NotificationPreferences;
}) {
  const settledRef = useRef<Set<string>>(new Set());
  const scheduledRef = useRef<Map<string, Scheduled>>(new Map());

  useEffect(() => {
    const getCandidates = (nowMs: number): Candidate[] => {
      const end = nowMs + HORIZON_MS;
      return params.todos
        .filter((todo) => !todo.completed)
        .map((todo) => {
          const dueMs = todo.dueDate ? new Date(todo.dueDate).getTime() : NaN;
          if (!Number.isFinite(dueMs)) return null;
          if (!isSameLocalDay(dueMs, nowMs)) return null;
          const fireAtMs = computeFireTimeMs(todo, params.prefs);
          if (fireAtMs === null) return null;
          if (fireAtMs > end) return null;
          const minutes = params.prefs.defaultReminderMinutes;
          return { todo, minutes, fireAtMs, key: buildKey(todo, minutes) };
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
      await notifyUpcomingTodo({
        todo: candidate.todo,
        prefs: params.prefs,
      });
    };

    const pruneSettled = (cutoffMs: number) => {
      for (const key of settledRef.current) {
        const parts = key.split("|");
        const whenIso = parts[1];
        const whenMs = new Date(whenIso).getTime();
        if (Number.isFinite(whenMs) && whenMs < cutoffMs) {
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
  }, [params.todos, params.prefs]);

  useEffect(() => {
    return () => {
      for (const scheduled of scheduledRef.current.values()) {
        window.clearTimeout(scheduled.timeoutId);
      }
      scheduledRef.current.clear();
    };
  }, []);
}
