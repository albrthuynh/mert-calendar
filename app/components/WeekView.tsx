"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  format,
  addDays,
  isToday,
  isSameDay,
} from "date-fns";
import { ChevronLeft, ChevronRight, ListTodo } from "lucide-react";
import { TimeGrid } from "./TimeGrid";
import { RecurringEventMoveModal } from "./RecurringEventMoveModal";
import { EventFormModal } from "./EventFormModal";
import { EventDetailPopover } from "./EventDetailPopover";
import { EventSidebar } from "./EventSidebar";
import { TodoSection } from "./TodoSection";
import { TodoSidebar } from "./TodoSidebar";
import { ViewToggle, type ViewMode } from "./ViewToggle";
import { CalendarEvent, ImportantDay, Todo } from "@/types/calendar";
import { ImportantDayLabel } from "./ImportantDayLabel";
import {
  ImportantDayEditorPopover,
  type ImportantDaySavePayload,
} from "./ImportantDayEditorPopover";
import { HOUR_HEIGHT } from "@/lib/calendarConstants";
import { fireCelebrationConfetti } from "@/lib/confetti";
import { useNotificationPreferences } from "../context/NotificationPreferencesContext";
import { useEventReminderScheduler } from "../hooks/useEventReminderScheduler";
import { useTodoReminderScheduler } from "../hooks/useTodoReminderScheduler";
import { useLiveNow } from "../hooks/useLiveNow";

export { HOUR_HEIGHT };

function getWeekLabel(weekStart: Date, weekEnd: Date): string {
  const startMonth = format(weekStart, "MMM");
  const endMonth = format(weekEnd, "MMM");
  if (startMonth === endMonth) {
    return `${startMonth} ${format(weekStart, "d")} – ${format(weekEnd, "d, yyyy")}`;
  }
  return `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;
}

interface WeekViewProps {
  onViewChange?: (view: ViewMode) => void;
  backgroundUrl?: string;
}

export function WeekView({ onViewChange, backgroundUrl }: WeekViewProps = {}) {
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );
  const currentTime = useLiveNow();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [importantDays, setImportantDays] = useState<ImportantDay[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);

  // Modal / popover / sidebar state
  const [showEventModal, setShowEventModal] = useState(false);
  const [createDate, setCreateDate] = useState<Date | undefined>();
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | undefined>();
  const [popoverEvent, setPopoverEvent] = useState<CalendarEvent | null>(null);
  const [popoverRect, setPopoverRect] = useState<DOMRect | null>(null);
  const [showEventSidebar, setShowEventSidebar] = useState(false);

  const [importantDayEditor, setImportantDayEditor] = useState<{
    day: Date;
    anchorRect: DOMRect;
  } | null>(null);

  const [recurringMovePending, setRecurringMovePending] = useState<{
    event: CalendarEvent;
    startTime: Date;
    endTime: Date;
  } | null>(null);
  const [recurringMoveBusy, setRecurringMoveBusy] = useState(false);
  const [recurringMoveError, setRecurringMoveError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const didInitialScrollRef = useRef(false);
  const notifPrefs = useNotificationPreferences();

  useEventReminderScheduler({ events, prefs: notifPrefs });
  useTodoReminderScheduler({ todos, prefs: notifPrefs });

  // Scroll to the current-time red line on first mount
  useEffect(() => {
    if (didInitialScrollRef.current) return;
    if (!scrollRef.current) return;
    if (!currentTime) return;

    const currentTimeTop =
      ((currentTime.getHours() * 60 + currentTime.getMinutes()) / 60) * HOUR_HEIGHT;

    const viewportHeight = scrollRef.current.clientHeight;
    const scrollTo = Math.max(0, currentTimeTop - viewportHeight / 2);

    scrollRef.current.scrollTop = scrollTo;
    didInitialScrollRef.current = true;
  }, [currentTime]);

  const weekEnd = useMemo(
    () => endOfWeek(weekStart, { weekStartsOn: 0 }),
    [weekStart]
  );
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // Fetch events + todos whenever the visible week changes
  useEffect(() => {
    const start = weekStart.toISOString();
    const end = weekEnd.toISOString();

    const fetchAll = async () => {
      setLoadingEvents(true);
      try {
        const startKey = format(weekStart, "yyyy-MM-dd");
        const endKey = format(weekEnd, "yyyy-MM-dd");
        const [eventsRes, todosRes, importantRes] = await Promise.all([
          fetch(`/api/events?start=${start}&end=${end}`),
          fetch(`/api/todos?start=${start}&end=${end}`),
          fetch(
            `/api/important-days?startKey=${encodeURIComponent(startKey)}&endKey=${encodeURIComponent(endKey)}`
          ),
        ]);
        if (eventsRes.ok) setEvents(await eventsRes.json());
        if (todosRes.ok) setTodos(await todosRes.json());
        if (importantRes.ok) setImportantDays(await importantRes.json());
      } catch {
        // Silently fail; user will see empty state
      } finally {
        setLoadingEvents(false);
      }
    };

    fetchAll();
  }, [weekStart, weekEnd]);

  const goToPrevWeek = useCallback(
    () => setWeekStart((w) => subWeeks(w, 1)),
    []
  );
  const goToNextWeek = useCallback(
    () => setWeekStart((w) => addWeeks(w, 1)),
    []
  );
  const goToToday = useCallback(
    () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 })),
    []
  );

  // ── Event handlers ──────────────────────────────────────────
  const handleSlotClick = useCallback((date: Date) => {
    setCreateDate(date);
    setShowEventModal(true);
    setPopoverEvent(null);
    setShowEventSidebar(false);
  }, []);

  const handleEventClick = useCallback(
    (event: CalendarEvent, rect: DOMRect) => {
      if (event.originalId.startsWith("temp-")) {
        setEditingEvent(event);
        setShowEventSidebar(true);
        setPopoverEvent(null);
        setPopoverRect(null);
      } else {
        if (
          popoverEvent &&
          popoverEvent.originalId === event.originalId &&
          popoverEvent.startTime === event.startTime
        ) {
          setPopoverEvent(null);
          setPopoverRect(null);
          return;
        }
        setPopoverEvent(event);
        setPopoverRect(rect);
      }
    },
    [popoverEvent]
  );

  const handleSlotDragCreate = useCallback(
    (start: Date, end: Date, _day: Date) => {
      const tempId = `temp-${Date.now()}`;
      const optimisticEvent: CalendarEvent = {
        id: tempId,
        originalId: tempId,
        title: "New event",
        description: null,
        link: null,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        color: "#4285F4",
        allDay: false,
        recurrenceRule: null,
        recurrenceEndDate: null,
        reminderMinutes: null,
        reminderDisabled: false,
        isRecurringInstance: false,
      };
      setEvents((prev) => [...prev, optimisticEvent]);
      setEditingEvent(optimisticEvent);
      setCreateDate(undefined);
      setShowEventSidebar(true);
      setPopoverEvent(null);
    },
    []
  );

  const handleEventResize = useCallback(
    async (event: CalendarEvent, startTime: Date, endTime: Date) => {
      if (event.originalId.startsWith("temp-")) {
        const updated = {
          ...event,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        };
        setEvents((prev) =>
          prev.map((e) =>
            e.originalId === event.originalId ? updated : e
          )
        );
        setEditingEvent((prev) =>
          prev?.originalId === event.originalId ? updated : prev
        );
        return;
      }
      
      // Optimistic update - update UI immediately
      const previousStartTime = event.startTime;
      const previousEndTime = event.endTime;
      const updated = {
        ...event,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      };
      setEvents((prev) =>
        prev.map((e) =>
          e.originalId === event.originalId && e.startTime === previousStartTime
            ? updated
            : e
        )
      );
      
      // Make API call in background
      const res = await fetch(`/api/events/${event.originalId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        }),
      });
      
      if (!res.ok) {
        // Revert on failure
        setEvents((prev) =>
          prev.map((e) =>
            e.originalId === event.originalId && e.startTime === startTime.toISOString()
              ? { ...e, startTime: previousStartTime, endTime: previousEndTime }
              : e
          )
        );
      }
    },
    [weekStart, weekEnd]
  );

  const handleEventMove = useCallback(
    async (event: CalendarEvent, startTime: Date, endTime: Date) => {
      if (event.isRecurringInstance && event.recurrenceRule) {
        setRecurringMoveError(null);
        setRecurringMovePending({ event, startTime, endTime });
        return;
      }

      if (event.originalId.startsWith("temp-")) {
        const updated = {
          ...event,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        };
        setEvents((prev) =>
          prev.map((e) =>
            e.originalId === event.originalId && e.startTime === event.startTime
              ? updated
              : e
          )
        );
        setEditingEvent((prev) =>
          prev?.originalId === event.originalId && prev?.startTime === event.startTime
            ? updated
            : prev
        );
        return;
      }
      
      // Optimistic update - update UI immediately
      const previousStartTime = event.startTime;
      const updated = {
        ...event,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      };
      setEvents((prev) =>
        prev.map((e) =>
          e.originalId === event.originalId && e.startTime === previousStartTime
            ? updated
            : e
        )
      );
      
      // Make API call in background
      const res = await fetch(`/api/events/${event.originalId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        }),
      });
      
      if (!res.ok) {
        // Revert on failure
        setEvents((prev) =>
          prev.map((e) =>
            e.originalId === event.originalId && e.startTime === startTime.toISOString()
              ? { ...e, startTime: previousStartTime, endTime: event.endTime }
              : e
          )
        );
      }
    },
    [weekStart, weekEnd]
  );

  const refreshEvents = useCallback(async () => {
    const start = weekStart.toISOString();
    const end = weekEnd.toISOString();
    const res = await fetch(`/api/events?start=${start}&end=${end}`);
    if (res.ok) setEvents(await res.json());
  }, [weekStart, weekEnd]);

  const applyRecurringMoveThisOnly = useCallback(async () => {
    if (!recurringMovePending) return;
    const { event, startTime, endTime } = recurringMovePending;
    const instanceStartTime =
      event.instanceStartTime ?? event.startTime;
    setRecurringMoveBusy(true);
    setRecurringMoveError(null);
    try {
      const res = await fetch(`/api/events/${event.originalId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editScope: "single",
          instanceStartTime,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          reminderDisabled: event.reminderDisabled,
          reminderMinutes: event.reminderMinutes,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let message = "Could not move this occurrence";
        try {
          message = JSON.parse(text).error ?? message;
        } catch {
          /* use default */
        }
        throw new Error(message);
      }
      setRecurringMovePending(null);
      await refreshEvents();
    } catch (e) {
      setRecurringMoveError(
        e instanceof Error ? e.message : "Something went wrong"
      );
    } finally {
      setRecurringMoveBusy(false);
    }
  }, [recurringMovePending, refreshEvents]);

  const applyRecurringMoveAll = useCallback(async () => {
    if (!recurringMovePending) return;
    const { event, startTime } = recurringMovePending;
    setRecurringMoveBusy(true);
    setRecurringMoveError(null);
    try {
      const parentRes = await fetch(`/api/events/${event.originalId}`);
      if (!parentRes.ok) {
        throw new Error("Could not load the series");
      }
      const parent = (await parentRes.json()) as {
        startTime: string;
        endTime: string;
      };
      const deltaMs =
        startTime.getTime() - new Date(event.startTime).getTime();
      const newSeriesStart = new Date(
        new Date(parent.startTime).getTime() + deltaMs
      );
      const newSeriesEnd = new Date(
        new Date(parent.endTime).getTime() + deltaMs
      );
      const res = await fetch(`/api/events/${event.originalId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: newSeriesStart.toISOString(),
          endTime: newSeriesEnd.toISOString(),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let message = "Could not move the series";
        try {
          message = JSON.parse(text).error ?? message;
        } catch {
          /* use default */
        }
        throw new Error(message);
      }
      setRecurringMovePending(null);
      await refreshEvents();
    } catch (e) {
      setRecurringMoveError(
        e instanceof Error ? e.message : "Something went wrong"
      );
    } finally {
      setRecurringMoveBusy(false);
    }
  }, [recurringMovePending, refreshEvents]);

  const handleEventSaved = useCallback(
    async (_saved: CalendarEvent) => {
      await refreshEvents();
      setShowEventModal(false);
      setShowEventSidebar(false);
      setEditingEvent(undefined);
      setCreateDate(undefined);
    },
    [refreshEvents]
  );

  const handleDeleteFromPopover = useCallback(async () => {
    if (!popoverEvent) return;
    await fetch(`/api/events/${popoverEvent.originalId}`, {
      method: "DELETE",
    });
    setEvents((prev) =>
      prev.filter((e) => e.originalId !== popoverEvent.originalId)
    );
    setPopoverEvent(null);
  }, [popoverEvent]);

  const handleDeleteFromSidebar = useCallback(async () => {
    if (!editingEvent) return;
    if (editingEvent.originalId.startsWith("temp-")) {
      setEvents((prev) =>
        prev.filter((e) => e.originalId !== editingEvent.originalId)
      );
      setShowEventSidebar(false);
      setEditingEvent(undefined);
      setCreateDate(undefined);
      return;
    }
    await refreshEvents();
    setShowEventSidebar(false);
    setEditingEvent(undefined);
    setCreateDate(undefined);
  }, [editingEvent, refreshEvents]);

  const handleEditFromPopover = useCallback(() => {
    if (!popoverEvent) return;
    setEditingEvent(popoverEvent);
    setShowEventModal(true);
    setPopoverEvent(null);
  }, [popoverEvent]);

  const handleEventMoveTime = useCallback(
    async (event: CalendarEvent, deltaMinutes: number) => {
      const newStart = new Date(
        new Date(event.startTime).getTime() + deltaMinutes * 60 * 1000
      );
      const newEnd = new Date(
        new Date(event.endTime).getTime() + deltaMinutes * 60 * 1000
      );
      const res = await fetch(`/api/events/${event.originalId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: newStart.toISOString(),
          endTime: newEnd.toISOString(),
        }),
      });
      if (res.ok) {
        setEvents((prev) =>
          prev.map((e) =>
            e.originalId === event.originalId && e.startTime === event.startTime
              ? {
                  ...e,
                  startTime: newStart.toISOString(),
                  endTime: newEnd.toISOString(),
                }
              : e
          )
        );
        setPopoverEvent((prev) =>
          prev &&
          prev.originalId === event.originalId &&
          prev.startTime === event.startTime
            ? { ...prev, startTime: newStart.toISOString(), endTime: newEnd.toISOString() }
            : prev
        );
        const rangeStart = weekStart.toISOString();
        const rangeEnd = weekEnd.toISOString();
        const eventsRes = await fetch(
          `/api/events?start=${rangeStart}&end=${rangeEnd}`
        );
        if (eventsRes.ok) setEvents(await eventsRes.json());
      }
    },
    [weekStart, weekEnd]
  );

  // ── Todo handlers ──────────────────────────────────────────
  const handleTodoAdd = useCallback((todo: Todo) => {
    setTodos((prev) => [...prev, todo]);
  }, []);

  const handleTodoToggle = useCallback(async (id: string, completed: boolean) => {
    setTodos((prev) => {
      const next = prev.map((t) =>
        t.id === id ? { ...t, completed } : t
      );

      if (completed) {
        const toggled = next.find((t) => t.id === id);
        if (toggled) {
          const dayTodos = next.filter((t) =>
            isSameDay(new Date(t.taskDate), new Date(toggled.taskDate))
          );
          if (
            dayTodos.length > 0 &&
            dayTodos.every((t) => t.completed)
          ) {
            queueMicrotask(() => fireCelebrationConfetti());
          }
        }
      }

      return next;
    });
    await fetch(`/api/todos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
  }, []);

  const handleTodoDelete = useCallback(async (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/todos/${id}`, { method: "DELETE" });
  }, []);

  const handleTodoEdit = useCallback(async (id: string, title: string) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
    await fetch(`/api/todos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  }, []);

  const handleTodoUpdate = useCallback((updated: Todo) => {
    setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }, []);

  const handleTodoMoveDay = useCallback(async (id: string, day: Date) => {
    const newDateIso = day.toISOString();
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, taskDate: newDateIso } : t))
    );
    await fetch(`/api/todos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskDate: newDateIso }),
    });
  }, []);

  const handleImportantDaySave = useCallback(
    async (payload: ImportantDaySavePayload) => {
      if (payload.remove) {
        const existing = importantDays.find((d) => d.date === payload.dateKey);
        if (!existing) return;
        const res = await fetch(`/api/important-days/${existing.id}`, {
          method: "DELETE",
        });
        if (res.ok) {
          setImportantDays((prev) => prev.filter((d) => d.id !== existing.id));
        }
        return;
      }
      const res = await fetch("/api/important-days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: payload.dateKey,
          label: payload.label,
        }),
      });
      if (res.ok) {
        const row: ImportantDay = await res.json();
        setImportantDays((prev) => {
          const rest = prev.filter((d) => d.date !== payload.dateKey);
          return [...rest, row].sort((a, b) => a.date.localeCompare(b.date));
        });
      }
    },
    [importantDays]
  );

  const weekLabel = getWeekLabel(weekStart, weekEnd);

  const containerStyle = backgroundUrl
    ? {
        backgroundImage: `url("${backgroundUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : undefined;

  return (
    <div
      className="flex flex-col flex-1 min-w-0 overflow-hidden bg-white dark:bg-gray-900 min-h-0"
      style={containerStyle}
    >
      {/* Week navigation */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-900">
        <button
          type="button"
          onClick={goToToday}
          className="px-3 py-1.5 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
        >
          Today
        </button>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={goToPrevWeek}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <button
            type="button"
            onClick={goToNextWeek}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Next week"
          >
            <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">{weekLabel}</h2>
        <div className="ml-auto flex items-center gap-2">
          {loadingEvents && (
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
          {onViewChange && (
            <ViewToggle currentView="week" onViewChange={onViewChange} />
          )}
          <button
            type="button"
            onClick={() => {
              if (showSidebar) {
                setShowSidebar(false);
                setSelectedDay(null);
              } else {
                setSelectedDay((prev) => prev ?? new Date());
                setShowSidebar(true);
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showSidebar
                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
            aria-label="Toggle to-do sidebar"
          >
            <ListTodo className="w-4 h-4" />
            {showSidebar && selectedDay
              ? format(selectedDay, "EEE, MMM d")
              : "Tasks"}
          </button>
        </div>
      </div>

      {/* Calendar + optional sidebar */}
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden bg-white/70 dark:bg-gray-900/70 backdrop-blur-[2px]">
      <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">

      {/* Day headers + todo sections */}
      <div className="flex min-w-0 overflow-x-hidden border-b border-gray-200 dark:border-gray-700 shrink-0">
        {/* Time gutter spacer */}
        <div className="w-14 shrink-0 flex flex-col">
          <div className="h-[60px]" />
        </div>

        {weekDays.map((day) => {
          const today = isToday(day);
          const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
          const dateKey = format(day, "yyyy-MM-dd");
          const importantRow = importantDays.find((d) => d.date === dateKey);
          const importantLabel = importantRow
            ? importantRow.label.trim()
            : "";
          return (
            <div
              key={day.toISOString()}
              className="flex-1 flex flex-col border-l border-gray-200 dark:border-gray-700 min-w-0"
            >
              <div className="relative shrink-0 group flex flex-col items-center">
                {/* Date header — click to open/toggle todo sidebar */}
                <button
                  type="button"
                  onClick={() => {
                    if (isSelected && showSidebar) {
                      setShowSidebar(false);
                      setSelectedDay(null);
                    } else {
                      setSelectedDay(day);
                      setShowSidebar(true);
                    }
                  }}
                  className="flex flex-col items-center py-2 min-h-[52px] justify-center w-full px-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <span
                    className={`text-xs font-medium uppercase tracking-wider ${
                      today
                        ? backgroundUrl
                          ? "text-blue-800 dark:text-blue-400"
                          : "text-blue-500"
                        : isSelected
                        ? backgroundUrl
                          ? "text-blue-800 dark:text-blue-400"
                          : "text-blue-400"
                        : backgroundUrl
                        ? "text-gray-900 dark:text-white"
                        : "text-gray-400 dark:text-gray-500"
                    }`}
                  >
                    {format(day, "EEE")}
                  </span>
                  <div
                    className={`mt-0.5 flex min-h-[1.25rem] items-center justify-center text-lg font-semibold tabular-nums ${
                      today
                        ? backgroundUrl
                          ? "text-blue-900 dark:text-blue-400"
                          : "text-blue-600 dark:text-blue-400"
                        : isSelected
                        ? backgroundUrl
                          ? "text-blue-900 dark:text-blue-400"
                          : "text-blue-600 dark:text-blue-400"
                        : backgroundUrl
                        ? "text-gray-900 dark:text-white"
                        : "text-gray-800 dark:text-gray-200"
                    }`}
                  >
                    {format(day, "d")}
                  </div>
                </button>
                {importantLabel ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setImportantDayEditor({
                        day,
                        anchorRect: e.currentTarget.getBoundingClientRect(),
                      });
                    }}
                    className="mt-0.5 w-full max-w-[min(100%,12rem)] px-1 text-center"
                  >
                    <ImportantDayLabel hasBackground={!!backgroundUrl}>{importantLabel}</ImportantDayLabel>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setImportantDayEditor({
                        day,
                        anchorRect: e.currentTarget.getBoundingClientRect(),
                      });
                    }}
                    title="Mark important day"
                    className={`mt-0.5 text-[10px] font-medium opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 ${
                      backgroundUrl
                        ? "text-gray-600 hover:text-gray-900 dark:text-white/60 dark:hover:text-white"
                        : "text-blue-600/50 hover:text-blue-700 dark:text-blue-400/50 dark:hover:text-blue-300"
                    }`}
                  >
                    Mark important
                  </button>
                )}
              </div>

              {/* Per-day todo section */}
              <TodoSection
                day={day}
                todos={todos}
                onAdd={handleTodoAdd}
                onToggle={handleTodoToggle}
                onDelete={handleTodoDelete}
                onEdit={handleTodoEdit}
                onUpdate={handleTodoUpdate}
                onMoveDay={handleTodoMoveDay}
                hasBackground={!!backgroundUrl}
              />
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      {currentTime && (
        <TimeGrid
          scrollRef={scrollRef}
          weekDays={weekDays}
          currentTime={currentTime}
          events={events}
          onSlotClick={handleSlotClick}
          onEventClick={handleEventClick}
          onSlotDragCreate={handleSlotDragCreate}
          onEventResize={handleEventResize}
          onEventMove={handleEventMove}
          hasBackground={!!backgroundUrl}
        />
      )}

      </div>{/* end calendar column */}

      {/* Todo sidebar */}
      {showSidebar && selectedDay && (
        <TodoSidebar
          selectedDay={selectedDay}
          todos={todos}
          onClose={() => { setShowSidebar(false); setSelectedDay(null); }}
          onAdd={handleTodoAdd}
          onToggle={handleTodoToggle}
          onDelete={handleTodoDelete}
          onEdit={handleTodoEdit}
          onUpdate={handleTodoUpdate}
        />
      )}
      </div>{/* end calendar + sidebar wrapper */}

      {/* Create / Edit event modal (slot click or edit from popover) */}
      {recurringMovePending && (
        <RecurringEventMoveModal
          eventTitle={recurringMovePending.event.title}
          busy={recurringMoveBusy}
          error={recurringMoveError}
          onClose={() => {
            if (!recurringMoveBusy) {
              setRecurringMovePending(null);
              setRecurringMoveError(null);
            }
          }}
          onChooseThisOnly={applyRecurringMoveThisOnly}
          onChooseAll={applyRecurringMoveAll}
        />
      )}

      {showEventModal && (
        <EventFormModal
          initialStartTime={createDate}
          event={editingEvent}
          onClose={() => {
            setShowEventModal(false);
            setEditingEvent(undefined);
            setCreateDate(undefined);
          }}
          onSave={handleEventSaved}
        />
      )}

      {/* Event detail popover (click existing event) */}
      {popoverEvent && popoverRect && (
        <EventDetailPopover
          event={popoverEvent}
          anchorRect={popoverRect}
          onClose={() => setPopoverEvent(null)}
          onEdit={handleEditFromPopover}
          onDelete={handleDeleteFromPopover}
          onMoveTime={handleEventMoveTime}
        />
      )}

      {/* Event sidebar (only for drag-create) */}
      {showEventSidebar && editingEvent && (
        <EventSidebar
          initialStartTime={createDate}
          event={editingEvent}
          onClose={() => {
            if (editingEvent?.originalId?.startsWith?.("temp-")) {
              setEvents((prev) =>
                prev.filter((e) => e.originalId !== editingEvent.originalId)
              );
            }
            setShowEventSidebar(false);
            setEditingEvent(undefined);
            setCreateDate(undefined);
          }}
          onSave={handleEventSaved}
          onDelete={handleDeleteFromSidebar}
        />
      )}

      {importantDayEditor && (
        <ImportantDayEditorPopover
          key={format(importantDayEditor.day, "yyyy-MM-dd")}
          day={importantDayEditor.day}
          anchorRect={importantDayEditor.anchorRect}
          existing={importantDays.find(
            (d) => d.date === format(importantDayEditor.day, "yyyy-MM-dd")
          )}
          onClose={() => setImportantDayEditor(null)}
          onSave={handleImportantDaySave}
        />
      )}
    </div>
  );
}
