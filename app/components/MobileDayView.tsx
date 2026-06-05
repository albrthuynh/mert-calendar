"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type CSSProperties,
} from "react";
import {
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  addDays,
  subDays,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  CalendarDays,
  Clock,
} from "lucide-react";
import { EventFormModal } from "./EventFormModal";
import { EventDetailPopover } from "./EventDetailPopover";
import { EventSidebar } from "./EventSidebar";
import { RecurringEventDeleteModal } from "./RecurringEventDeleteModal";
import { TodoItem } from "./TodoItem";
import { TodoFormModal } from "./TodoFormModal";
import {
  ImportantDayEditorPopover,
  type ImportantDaySavePayload,
} from "./ImportantDayEditorPopover";
import { CalendarEvent, ImportantDay, Todo } from "@/types/calendar";
import { fireCelebrationConfetti } from "@/lib/confetti";
import { buildEventCopyPayload } from "@/lib/eventCopy";
import {
  buildEventDeleteRequest,
  type EventDeleteScope,
  removeDeletedEventFromList,
} from "@/lib/eventDelete";
import {
  eventsVersionChanged,
  fetchEventsForRange,
  fetchImportantDaysForRange,
  fetchTodosForRange,
  invalidateEventsCache,
  invalidateImportantDaysCache,
  invalidateTodosCache,
} from "@/lib/calendarDataCache";
import { useNotificationPreferences } from "../context/NotificationPreferencesContext";
import { useEventReminderScheduler } from "../hooks/useEventReminderScheduler";
import { useTodoReminderScheduler } from "../hooks/useTodoReminderScheduler";

type MobileTab = "todos" | "events";
type MobileCalendarMode = "day" | "month";

interface MobileDayViewProps {
  backgroundUrl?: string;
}

function defaultEventStartForDay(day: Date): Date {
  const now = new Date();
  const start = startOfDay(day);
  const roundedMinutes =
    now.getMinutes() === 0 ? 0 : now.getMinutes() <= 30 ? 30 : 60;

  start.setHours(now.getHours(), roundedMinutes, 0, 0);
  if (!isSameDay(start, day)) {
    start.setHours(23, 0, 0, 0);
  }
  return start;
}

function getMobileMonthDays(monthStart: Date): Date[] {
  const start = startOfWeek(monthStart, { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 0 });

  const days: Date[] = [];
  let current = start;
  while (current <= end) {
    days.push(current);
    current = addDays(current, 1);
  }
  return days;
}

function getEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);

  return events
    .filter((event) => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      return eventStart <= dayEnd && eventEnd >= dayStart;
    })
    .sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
}

export function MobileDayView({ backgroundUrl }: MobileDayViewProps) {
  const [currentDay, setCurrentDay] = useState<Date>(() => startOfDay(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [importantDays, setImportantDays] = useState<ImportantDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<MobileTab>("events");
  const [calendarMode, setCalendarMode] = useState<MobileCalendarMode>("day");

  // Modal / popover / sidebar state
  const [showEventModal, setShowEventModal] = useState(false);
  const [createDate, setCreateDate] = useState<Date | undefined>();
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | undefined>();
  const [popoverEvent, setPopoverEvent] = useState<CalendarEvent | null>(null);
  const [showEventSidebar, setShowEventSidebar] = useState(false);
  const [recurringDeletePending, setRecurringDeletePending] =
    useState<CalendarEvent | null>(null);
  const [recurringDeleteBusy, setRecurringDeleteBusy] = useState(false);
  const [recurringDeleteError, setRecurringDeleteError] = useState<string | null>(null);

  const [showTodoModal, setShowTodoModal] = useState(false);
  const [importantDayEditor, setImportantDayEditor] = useState<{
    day: Date;
    anchorRect: DOMRect;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const notifPrefs = useNotificationPreferences();

  useEventReminderScheduler({ events, prefs: notifPrefs });
  useTodoReminderScheduler({ todos, prefs: notifPrefs });

  // Calculate the week days (starting from Sunday)
  const weekStart = startOfWeek(currentDay, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const mobileMonthStart = startOfMonth(currentDay);
  const mobileMonthDays = getMobileMonthDays(mobileMonthStart);
  const visibleStart =
    calendarMode === "month"
      ? startOfDay(mobileMonthDays[0])
      : startOfDay(currentDay);
  const visibleEnd =
    calendarMode === "month"
      ? endOfDay(mobileMonthDays[mobileMonthDays.length - 1])
      : endOfDay(currentDay);

  // Fetch events + todos when the visible mobile range changes.
  useEffect(() => {
    const start = visibleStart.toISOString();
    const end = visibleEnd.toISOString();

    const fetchAll = async () => {
      setLoading(true);
      try {
        const [nextEvents, nextTodos] = await Promise.all([
          fetchEventsForRange(start, end),
          fetchTodosForRange(start, end),
        ]);
        setEvents(nextEvents);
        setTodos(nextTodos);
      } catch {
        // empty
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [calendarMode, currentDay]);

  useEffect(() => {
    const startKey = format(visibleStart, "yyyy-MM-dd");
    const endKey = format(visibleEnd, "yyyy-MM-dd");

    const fetchImportantDays = async () => {
      try {
        setImportantDays(await fetchImportantDaysForRange(startKey, endKey));
      } catch {
        // empty
      }
    };

    fetchImportantDays();
  }, [calendarMode, currentDay]);

  const goToPrevWeek = useCallback(
    () => setCurrentDay((d) => startOfDay(subDays(d, 7))),
    []
  );

  const goToNextWeek = useCallback(
    () => setCurrentDay((d) => startOfDay(addDays(d, 7))),
    []
  );

  const goToToday = useCallback(
    () => setCurrentDay(startOfDay(new Date())),
    []
  );

  const goToPrevMonth = useCallback(
    () => setCurrentDay((d) => startOfDay(subMonths(d, 1))),
    []
  );

  const goToNextMonth = useCallback(
    () => setCurrentDay((d) => startOfDay(addMonths(d, 1))),
    []
  );

  const selectDay = useCallback((day: Date) => {
    setCurrentDay(startOfDay(day));
  }, []);

  const handleDatePicked = useCallback(
    (value: string) => {
      const [yearText, monthText, dayText] = value.split("-");
      const year = Number(yearText);
      const month = Number(monthText);
      const day = Number(dayText);
      if (!year || !month || !day) return;

      setCurrentDay(startOfDay(new Date(year, month - 1, day)));
    },
    []
  );

  const handleAddEvent = useCallback(() => {
    setCreateDate(defaultEventStartForDay(currentDay));
    setEditingEvent(undefined);
    setPopoverEvent(null);
    setShowEventSidebar(false);
    setActiveTab("events");
    setShowEventModal(true);
  }, [currentDay]);

  // ── Event handlers ──────────────────────────────────────────

  const refreshEvents = useCallback(async (options?: { force?: boolean }) => {
    const rangeStart =
      calendarMode === "month"
        ? startOfDay(getMobileMonthDays(startOfMonth(currentDay))[0])
        : startOfDay(currentDay);
    const monthDays = getMobileMonthDays(startOfMonth(currentDay));
    const rangeEnd =
      calendarMode === "month"
        ? endOfDay(monthDays[monthDays.length - 1])
        : endOfDay(currentDay);
    const start = rangeStart.toISOString();
    const end = rangeEnd.toISOString();
    setEvents(await fetchEventsForRange(start, end, options));
  }, [calendarMode, currentDay]);

  useEffect(() => {
    const checkForEventChanges = async () => {
      try {
        if (await eventsVersionChanged()) {
          invalidateEventsCache();
          await refreshEvents({ force: true });
        }
      } catch {
        // Keep the current calendar visible if a background freshness check fails.
      }
    };
    const handleEventsUpdated = () => {
      invalidateEventsCache();
      void refreshEvents({ force: true });
    };
    const interval = window.setInterval(checkForEventChanges, 10000);
    window.addEventListener("mert-calendar:events-updated", handleEventsUpdated);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("mert-calendar:events-updated", handleEventsUpdated);
    };
  }, [refreshEvents]);

  const handleCopyEventToDate = useCallback(
    async (event: CalendarEvent, targetDay: Date) => {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildEventCopyPayload(event, targetDay)),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Could not copy event.");
      }

      invalidateEventsCache();
      await refreshEvents({ force: true });
    },
    [refreshEvents]
  );

  const handleEventClick = useCallback(
    (event: CalendarEvent) => {
      if (event.originalId.startsWith("temp-")) {
        setEditingEvent(event);
        setShowEventSidebar(true);
        setPopoverEvent(null);
        setActiveTab("events");
      } else {
        if (
          popoverEvent &&
          popoverEvent.originalId === event.originalId &&
          popoverEvent.startTime === event.startTime
        ) {
          setPopoverEvent(null);
          return;
        }
        setPopoverEvent(event);
        setActiveTab("events");
      }
    },
    [popoverEvent]
  );

  const handleEventSaved = useCallback(
    async () => {
      invalidateEventsCache();
      await refreshEvents({ force: true });
      setShowEventModal(false);
      setShowEventSidebar(false);
      setEditingEvent(undefined);
      setCreateDate(undefined);
      setActiveTab("events");
    },
    [refreshEvents]
  );

  const handleDeleteFromPopover = useCallback(async () => {
    if (!popoverEvent) return;
    if (popoverEvent.isRecurringInstance && popoverEvent.recurrenceRule) {
      setRecurringDeletePending(popoverEvent);
      setRecurringDeleteError(null);
      setPopoverEvent(null);
      return;
    }

    const res = await fetch(
      `/api/events/${popoverEvent.originalId}`,
      buildEventDeleteRequest(popoverEvent)
    );
    if (!res.ok) return;
    invalidateEventsCache();
    setEvents((prev) => removeDeletedEventFromList(prev, popoverEvent));
    setPopoverEvent(null);
  }, [popoverEvent]);

  const applyRecurringDelete = useCallback(
    async (scope: EventDeleteScope) => {
      if (!recurringDeletePending) return;
      setRecurringDeleteBusy(true);
      setRecurringDeleteError(null);
      try {
        const res = await fetch(
          `/api/events/${recurringDeletePending.originalId}`,
          buildEventDeleteRequest(recurringDeletePending, scope)
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "Could not delete event.");
        }
        setEvents((prev) =>
          removeDeletedEventFromList(prev, recurringDeletePending, scope)
        );
        invalidateEventsCache();
        setRecurringDeletePending(null);
      } catch (error) {
        setRecurringDeleteError(
          error instanceof Error ? error.message : "Something went wrong"
        );
      } finally {
        setRecurringDeleteBusy(false);
      }
    },
    [recurringDeletePending]
  );

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
    invalidateEventsCache();
    await refreshEvents({ force: true });
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
        invalidateEventsCache();
        await refreshEvents({ force: true });
      }
    },
    [refreshEvents]
  );

  // ── Todo handlers ──────────────────────────────────────────

  const handleTodoAdd = useCallback((todo: Todo) => {
    invalidateTodosCache();
    setTodos((prev) => [...prev, todo]);
  }, []);

  const handleTodoToggle = useCallback(
    async (id: string, completed: boolean) => {
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
      invalidateTodosCache();
    },
    []
  );

  const handleTodoDelete = useCallback(async (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/todos/${id}`, { method: "DELETE" });
    invalidateTodosCache();
  }, []);

  const handleTodoEdit = useCallback(async (id: string, title: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title } : t))
    );
    await fetch(`/api/todos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    invalidateTodosCache();
  }, []);

  const handleTodoUpdate = useCallback((updated: Todo) => {
    invalidateTodosCache();
    setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
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
          invalidateImportantDaysCache();
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
        invalidateImportantDaysCache();
        setImportantDays((prev) => {
          const rest = prev.filter((d) => d.date !== payload.dateKey);
          return [...rest, row].sort((a, b) => a.date.localeCompare(b.date));
        });
      }
    },
    [importantDays]
  );

  const dayTodos = todos.filter((t) =>
    isSameDay(new Date(t.taskDate), currentDay)
  );
  const completedCount = dayTodos.filter((t) => t.completed).length;

  const dayEvents = getEventsForDay(events, currentDay);
  const selectedDayKey = format(currentDay, "yyyy-MM-dd");
  const selectedImportantLabel =
    importantDays.find((day) => day.date === selectedDayKey)?.label.trim() ?? "";

  const containerStyle = backgroundUrl
    ? {
        backgroundImage: `url("${backgroundUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : undefined;

  const overBackgroundClass = backgroundUrl
    ? "bg-white/70 dark:bg-gray-900/70"
    : "";

  return (
    <div
      className="flex flex-col flex-1 overflow-hidden bg-white dark:bg-gray-900"
      style={containerStyle}
    >
      {calendarMode === "day" ? (
        <div
          className={`flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0 ${overBackgroundClass}`}
        >
          <button
            type="button"
            onClick={goToPrevWeek}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <div className="flex-1 grid grid-cols-7 gap-1">
            {weekDays.map((day) => {
              const isSelected = isSameDay(day, currentDay);
              const isDayToday = isToday(day);
              const dateKey = format(day, "yyyy-MM-dd");
              const importantLabel =
                importantDays.find((importantDay) => importantDay.date === dateKey)?.label.trim() ?? "";
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={`flex flex-col items-center py-2 px-1 rounded-lg transition-colors ${
                    isSelected
                      ? "bg-blue-500 text-white"
                      : isDayToday
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                  }`}
                >
                  <span className="text-[10px] font-medium uppercase">
                    {format(day, "EEE")}
                  </span>
                  <span className={`text-sm font-semibold mt-0.5 ${
                    isSelected ? "text-white" : ""
                  }`}>
                    {format(day, "d")}
                  </span>
                  <span
                    className={`mt-1 h-1.5 w-1.5 rounded-full ${
                      importantLabel
                        ? isSelected
                          ? "bg-white"
                          : "bg-blue-500 dark:bg-blue-400"
                        : "opacity-0"
                    }`}
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={goToNextWeek}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Next week"
          >
            <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      ) : (
        <div
          className={`shrink-0 border-b border-gray-200 px-3 py-3 dark:border-gray-700 ${overBackgroundClass}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={goToPrevMonth}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {format(mobileMonthStart, "MMMM yyyy")}
            </div>
            <button
              type="button"
              onClick={goToNextMonth}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          <div className="grid grid-cols-7 pb-1 text-center text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {mobileMonthDays.map((day) => {
              const isSelected = isSameDay(day, currentDay);
              const isDayToday = isToday(day);
              const inMonth = isSameMonth(day, mobileMonthStart);
              const dateKey = format(day, "yyyy-MM-dd");
              const importantLabel =
                importantDays.find((importantDay) => importantDay.date === dateKey)?.label.trim() ?? "";
              const cellEvents = getEventsForDay(events, day);
              const cellTodos = todos.filter((todo) =>
                isSameDay(new Date(todo.taskDate), day)
              );

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={`min-h-[3.8rem] rounded-lg border px-1.5 py-1 text-left transition-colors ${
                    isSelected
                      ? "border-blue-500 bg-blue-500 text-white"
                      : isDayToday
                      ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                      : "border-gray-200 bg-white/75 text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-300 dark:hover:bg-gray-800"
                  } ${inMonth ? "" : "opacity-45"}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold tabular-nums">
                      {format(day, "d")}
                    </span>
                    {importantLabel && (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isSelected ? "bg-white" : "bg-blue-500 dark:bg-blue-400"
                        }`}
                        aria-hidden
                      />
                    )}
                  </div>
                  <div className="mt-1 min-h-[1.5rem] space-y-0.5">
                    {cellEvents.slice(0, 2).map((event) => (
                      <div
                        key={`${event.originalId}-${event.startTime}`}
                        className={`h-1.5 rounded-full ${isSelected ? "bg-white/80" : ""}`}
                        style={{
                          backgroundColor: isSelected ? undefined : event.color,
                        }}
                      />
                    ))}
                    {cellEvents.length > 2 && (
                      <div
                        className={`text-[9px] leading-none ${
                          isSelected
                            ? "text-white/85"
                            : "text-gray-400 dark:text-gray-500"
                        }`}
                      >
                        +{cellEvents.length - 2}
                      </div>
                    )}
                  </div>
                  {cellTodos.length > 0 && (
                    <div
                      className={`mt-1 text-[9px] leading-none ${
                        isSelected
                          ? "text-white/85"
                          : "text-gray-400 dark:text-gray-500"
                      }`}
                    >
                      {cellTodos.length} task{cellTodos.length === 1 ? "" : "s"}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Current Day Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-900">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {format(currentDay, "EEEE")}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {format(currentDay, "MMMM d, yyyy")}
          </span>
          {selectedImportantLabel ? (
            <button
              type="button"
              onClick={(e) =>
                setImportantDayEditor({
                  day: currentDay,
                  anchorRect: e.currentTarget.getBoundingClientRect(),
                })
              }
              className="mt-1 inline-flex max-w-[17rem] items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
              title="Edit important day"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500 dark:bg-blue-300" />
              <span className="truncate">Important: {selectedImportantLabel}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) =>
                setImportantDayEditor({
                  day: currentDay,
                  anchorRect: e.currentTarget.getBoundingClientRect(),
                })
              }
              className="mt-1 inline-flex w-fit items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/30"
            >
              Mark important
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => setCalendarMode("day")}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                calendarMode === "day"
                  ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setCalendarMode("month")}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                calendarMode === "month"
                  ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              Month
            </button>
          </div>
          <div className="relative inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300">
            <CalendarDays className="h-3.5 w-3.5" />
            <span>Pick</span>
            <input
              type="date"
              value={format(currentDay, "yyyy-MM-dd")}
              onChange={(e) => handleDatePicked(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Pick date"
            />
          </div>
          <button
            type="button"
            onClick={goToToday}
            className="px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
          >
            Today
          </button>
          {loading && (
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        className={`px-4 pt-3 pb-2 border-b border-gray-200 dark:border-gray-800 shrink-0 ${overBackgroundClass}`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>{format(currentDay, "EEEE, MMMM d")}</span>
          </div>
        </div>
        <div className="inline-flex bg-gray-100 dark:bg-gray-800 rounded-full p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab("todos")}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              activeTab === "todos"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            To-Dos
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("events")}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              activeTab === "events"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            Events
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden bg-white/70 dark:bg-gray-900/70">
        {activeTab === "todos" ? (
          <div className="h-full flex flex-col">
            <div className="px-4 pt-3 pb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  To-Do List
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {dayTodos.length > 0
                    ? `${completedCount} of ${dayTodos.length} done`
                    : "No tasks for this day"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTodoModal(true)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-200 dark:border-blue-800 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
              >
                + Add
              </button>
            </div>
            {dayTodos.length > 0 && (
              <div className="px-4 pb-2">
                <div className="w-full h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{
                      width: `${(completedCount / dayTodos.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-3 pb-4">
              {dayTodos.length > 0 ? (
                <div className="space-y-1.5">
                  {dayTodos.map((todo) => (
                    <TodoItem
                      key={todo.id}
                      todo={todo}
                      onToggle={handleTodoToggle}
                      onDelete={handleTodoDelete}
                      onEdit={handleTodoEdit}
                      onUpdate={handleTodoUpdate}
                      variant="sidebar"
                    />
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center px-6">
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    No tasks yet for this day.
                  </p>
                  <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">
                    Tap &ldquo;+ Add&rdquo; above to create one.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            <div className="px-4 pt-3 pb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  Events
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {dayEvents.length > 0
                    ? `${dayEvents.length} event${dayEvents.length > 1 ? 's' : ''}`
                    : "No events for this day"}
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddEvent}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-200 dark:border-blue-800 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
              >
                + Add
              </button>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 pb-4">
              {dayEvents.length > 0 ? (
                <div className="space-y-2">
                  {dayEvents.map((event) => (
                    <button
                      key={`${event.originalId}-${event.startTime}`}
                      type="button"
                      onClick={() => handleEventClick(event)}
                      className={`w-full text-left p-3 rounded-lg border-l-4 hover:shadow-md transition-shadow ${
                        backgroundUrl
                          ? "bg-[var(--event-card-bg-light)] dark:bg-[var(--event-card-bg-dark)]"
                          : "bg-white dark:bg-gray-800"
                      }`}
                      style={{
                        borderLeftColor: event.color,
                        backgroundColor: (() => {
                          const hex = event.color;
                          const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                          if (result) {
                            const r = parseInt(result[1], 16);
                            const g = parseInt(result[2], 16);
                            const b = parseInt(result[3], 16);
                            return backgroundUrl
                              ? undefined
                              : `rgba(${r}, ${g}, ${b}, 0.05)`;
                          }
                          return backgroundUrl ? undefined : `${event.color}0d`;
                        })(),
                        "--event-card-bg-light": (() => {
                          const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(event.color);
                          if (!result) return `${event.color}38`;
                          const r = parseInt(result[1], 16);
                          const g = parseInt(result[2], 16);
                          const b = parseInt(result[3], 16);
                          return `rgba(${r}, ${g}, ${b}, 0.22)`;
                        })(),
                        "--event-card-bg-dark": (() => {
                          const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(event.color);
                          if (!result) return `${event.color}0d`;
                          const r = parseInt(result[1], 16);
                          const g = parseInt(result[2], 16);
                          const b = parseInt(result[3], 16);
                          return `rgba(${r}, ${g}, ${b}, 0.05)`;
                        })(),
                      } as CSSProperties}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                            {event.title}
                          </h3>
                          {event.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                              {event.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 shrink-0">
                          <Clock className="w-3.5 h-3.5" />
                          <span className="font-medium">
                            {format(new Date(event.startTime), "h:mm a")}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>
                          {format(new Date(event.startTime), "h:mm a")} – {format(new Date(event.endTime), "h:mm a")}
                        </span>
                        {event.recurrenceRule && (
                          <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px]">
                            Recurring
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center px-6">
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    No events for this day.
                  </p>
                  <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">
                    Tap &ldquo;+ Add&rdquo; above to create one.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {recurringDeletePending && (
        <RecurringEventDeleteModal
          eventTitle={recurringDeletePending.title}
          busy={recurringDeleteBusy}
          error={recurringDeleteError}
          onClose={() => {
            if (!recurringDeleteBusy) {
              setRecurringDeletePending(null);
              setRecurringDeleteError(null);
            }
          }}
          onChooseThisOnly={() => applyRecurringDelete("single")}
          onChooseAll={() => applyRecurringDelete("series")}
        />
      )}

      {/* Create / Edit event modal (slot click or edit from popover) */}
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
      {popoverEvent && (
        <EventDetailPopover
          event={popoverEvent}
          anchorRect={new DOMRect(0, 0, window.innerWidth, window.innerHeight)}
          onClose={() => setPopoverEvent(null)}
          onEdit={handleEditFromPopover}
          onDelete={handleDeleteFromPopover}
          onCopyToDate={handleCopyEventToDate}
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

      {/* Add todo modal */}
      {showTodoModal && (
        <TodoFormModal
          initialDate={currentDay}
          onClose={() => setShowTodoModal(false)}
          onSave={(saved) => {
            handleTodoAdd(saved);
            setShowTodoModal(false);
          }}
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
