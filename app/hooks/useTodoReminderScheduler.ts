"use client";

import { useEffect, useRef } from "react";
import type { Todo } from "@/types/calendar";
import type { NotificationPreferences } from "@/app/context/NotificationPreferencesContext";
import { notifyUpcomingTodo } from "@/lib/notifyUpcomingTodo";
import { useToast } from "@/app/components/ToastProvider";

type Scheduled = {
  key: string;
  timeoutId: number;
  fireAtMs: number;
};

function buildKey(todo: Todo, minutes: number) {
  return `${todo.id}|${todo.dueDate ?? todo.taskDate}|${minutes}`;
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
  const { pushToast } = useToast();
  const firedRef = useRef<Set<string>>(new Set());
  const scheduledRef = useRef<Map<string, Scheduled>>(new Map());

  useEffect(() => {
    const now = Date.now();
    const horizonMs = 24 * 60 * 60 * 1000;
    const end = now + horizonMs;

    const candidates = params.todos
      .filter((todo) => !todo.completed)
      .map((todo) => {
        const fireAtMs = computeFireTimeMs(todo, params.prefs);
        if (fireAtMs === null) return null;
        if (fireAtMs < now - 60_000) return null;
        if (fireAtMs > end) return null;
        const minutes = params.prefs.defaultReminderMinutes;
        return { todo, minutes, fireAtMs, key: buildKey(todo, minutes) };
      })
      .filter(
        (x): x is { todo: Todo; minutes: number; fireAtMs: number; key: string } =>
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
      const timeoutId = window.setTimeout(async () => {
        if (firedRef.current.has(c.key)) return;
        firedRef.current.add(c.key);
        scheduledRef.current.delete(c.key);
        await notifyUpcomingTodo({
          todo: c.todo,
          prefs: params.prefs,
          pushToast,
        });
      }, delay);

      scheduledRef.current.set(c.key, { key: c.key, timeoutId, fireAtMs: c.fireAtMs });
    }

    // Light periodic cleanup
    const cleanup = window.setTimeout(() => {
      const cutoff = Date.now() - 48 * 60 * 60 * 1000;
      for (const key of firedRef.current) {
        const parts = key.split("|");
        const whenIso = parts[1];
        const whenMs = new Date(whenIso).getTime();
        if (Number.isFinite(whenMs) && whenMs < cutoff) {
          firedRef.current.delete(key);
        }
      }
    }, 60_000);

    return () => {
      window.clearTimeout(cleanup);
    };
  }, [params.todos, params.prefs, pushToast]);
}

