"use client";

import { useCallback, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { fetchEventsForRange } from "@/lib/calendarDataCache";
import { readSavedEvents } from "@/lib/persistentEventCache";
import { useCalendarCacheUserId } from "../context/CalendarCacheContext";
import type { CalendarEvent } from "@/types/calendar";

export function useCalendarEvents(start: string, end: string, setEvents: Dispatch<SetStateAction<CalendarEvent[]>>) {
  const userId = useCalendarCacheUserId();
  const [loading, setLoading] = useState(false);
  const requestSequence = useRef({ value: 0 });

  const refreshEvents = useCallback(async (options?: { force?: boolean }) => {
    const sequence = ++requestSequence.current.value;
    const nextEvents = await fetchEventsForRange(start, end, { ...options, userId });
    if (sequence === requestSequence.current.value) setEvents(nextEvents);
  }, [start, end, userId, setEvents]);

  useLayoutEffect(() => {
    const savedEvents = userId ? readSavedEvents(userId, start, end) : undefined;
    // Restore after hydration but before paint, so server and client markup agree.
    setEvents(savedEvents ?? []);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Match the loading indicator to the browser snapshot before paint.
    setLoading(savedEvents === undefined);
    let disposed = false;
    void refreshEvents({ force: true }).catch(() => {
      // Keep the saved schedule visible if revalidation fails.
    }).finally(() => {
      if (!disposed) setLoading(false);
    });
    const requests = requestSequence.current;
    return () => {
      disposed = true;
      requests.value++;
    };
  }, [start, end, userId, refreshEvents, setEvents]);

  return { loading, refreshEvents };
}
