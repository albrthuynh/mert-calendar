"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  startOfDay,
  endOfDay,
  addDays,
  subDays,
  startOfWeek,
  format,
  isSameDay,
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
import { useNotificationPreferences } from "../context/NotificationPreferencesContext";
import { useEventReminderScheduler } from "../hooks/useEventReminderScheduler";
import { useTodoReminderScheduler } from "../hooks/useTodoReminderScheduler";

type MobileTab = "todos" | "events";

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

export function MobileDayView({ backgroundUrl }: MobileDayViewProps) {
  const [currentDay, setCurrentDay] = useState<Date>(() => startOfDay(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [importantDays, setImportantDays] = useState<ImportantDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<MobileTab>("events");

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

  // Fetch events + todos when the visible day changes
  useEffect(() => {
    const start = startOfDay(currentDay).toISOString();
    const end = endOfDay(currentDay).toISOString();

    const fetchAll = async () => {
      setLoading(true);
      try {
        const [eventsRes, todosRes] = await Promise.all([
          fetch(`/api/events?start=${start}&end=${end}`),
          fetch(`/api/todos?start=${start}&end=${end}`),
        ]);
        if (eventsRes.ok) setEvents(await eventsRes.json());
        if (todosRes.ok) setTodos(await todosRes.json());
      } catch {
        // empty
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [currentDay]);

  useEffect(() => {
    const startKey = format(weekStart, "yyyy-MM-dd");
    const endKey = format(addDays(weekStart, 6), "yyyy-MM-dd");

    const fetchImportantDays = async () => {
      try {
        const res = await fetch(
          `/api/important-days?startKey=${encodeURIComponent(startKey)}&endKey=${encodeURIComponent(endKey)}`
        );
        if (res.ok) {
          setImportantDays(await res.json());
        }
      } catch {
        // empty
      }
    };

    fetchImportantDays();
  }, [weekStart]);

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

  const refreshEvents = useCallback(async () => {
    const start = startOfDay(currentDay).toISOString();
    const end = endOfDay(currentDay).toISOString();
    const res = await fetch(`/api/events?start=${start}&end=${end}`);
    if (res.ok) setEvents(await res.json());
  }, [currentDay]);

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

      await refreshEvents();
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
      await refreshEvents();
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
        await refreshEvents();
      }
    },
    [refreshEvents]
  );

  // ── Todo handlers ──────────────────────────────────────────

  const handleTodoAdd = useCallback((todo: Todo) => {
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
    },
    []
  );

  const handleTodoDelete = useCallback(async (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/todos/${id}`, { method: "DELETE" });
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
  }, []);

  const handleTodoUpdate = useCallback((updated: Todo) => {
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

  const dayTodos = todos.filter((t) =>
    isSameDay(new Date(t.taskDate), currentDay)
  );
  const completedCount = dayTodos.filter((t) => t.completed).length;

  const dayEvents = events.filter((e) =>
    isSameDay(new Date(e.startTime), currentDay)
  ).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
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
    ? "bg-white/70 dark:bg-gray-900/70 backdrop-blur-[2px]"
    : "";

  return (
    <div
      className="flex flex-col flex-1 overflow-hidden bg-white dark:bg-gray-900"
      style={containerStyle}
    >
      {/* Week Selector */}
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

      {/* Current Day Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-900">
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
        <div className="flex items-center gap-2">
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
      <div className="flex-1 overflow-hidden bg-white/70 dark:bg-gray-900/70 backdrop-blur-[2px]">
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
                      className="w-full text-left p-3 rounded-lg border-l-4 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow"
                      style={{
                        borderLeftColor: event.color,
                        backgroundColor: (() => {
                          const hex = event.color;
                          const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                          if (result) {
                            const r = parseInt(result[1], 16);
                            const g = parseInt(result[2], 16);
                            const b = parseInt(result[3], 16);
                            return `rgba(${r}, ${g}, ${b}, 0.05)`;
                          }
                          return undefined;
                        })(),
                      }}
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
