"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  startOfDay,
  endOfDay,
  addDays,
  subDays,
  format,
  isSameDay,
} from "date-fns";
import { ChevronLeft, ChevronRight, ListTodo, Calendar as CalendarIcon } from "lucide-react";
import { TimeGrid } from "./TimeGrid";
import { EventFormModal } from "./EventFormModal";
import { EventDetailPopover } from "./EventDetailPopover";
import { EventSidebar } from "./EventSidebar";
import { TodoItem } from "./TodoItem";
import { TodoFormModal } from "./TodoFormModal";
import { CalendarEvent, Todo } from "@/types/calendar";
import { HOUR_HEIGHT } from "@/lib/calendarConstants";
import { fireCelebrationConfetti } from "@/lib/confetti";
import { useNotificationPreferences } from "../context/NotificationPreferencesContext";
import { useEventReminderScheduler } from "../hooks/useEventReminderScheduler";

type MobileTab = "todos" | "events";

interface MobileDayViewProps {
  backgroundUrl?: string;
}

export function MobileDayView({ backgroundUrl }: MobileDayViewProps) {
  const [currentDay, setCurrentDay] = useState<Date>(() => startOfDay(new Date()));
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<MobileTab>("todos");

  // Modal / popover / sidebar state
  const [showEventModal, setShowEventModal] = useState(false);
  const [createDate, setCreateDate] = useState<Date | undefined>();
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | undefined>();
  const [popoverEvent, setPopoverEvent] = useState<CalendarEvent | null>(null);
  const [popoverRect, setPopoverRect] = useState<DOMRect | null>(null);
  const [showEventSidebar, setShowEventSidebar] = useState(false);

  const [showTodoModal, setShowTodoModal] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const didInitialScrollRef = useRef(false);
  const notifPrefs = useNotificationPreferences();

  useEventReminderScheduler({ events, prefs: notifPrefs });

  // Live clock
  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to the current-time red line on first mount
  useEffect(() => {
    if (didInitialScrollRef.current) return;
    if (!scrollRef.current) return;
    if (!currentTime) return;

    const currentTimeTop =
      ((currentTime.getHours() * 60 + currentTime.getMinutes()) / 60) *
      HOUR_HEIGHT;

    const viewportHeight = scrollRef.current.clientHeight;
    const scrollTo = Math.max(0, currentTimeTop - viewportHeight / 2);

    scrollRef.current.scrollTop = scrollTo;
    didInitialScrollRef.current = true;
  }, [currentTime]);

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

  const goToPrevDay = useCallback(
    () => setCurrentDay((d) => startOfDay(subDays(d, 1))),
    []
  );

  const goToNextDay = useCallback(
    () => setCurrentDay((d) => startOfDay(addDays(d, 1))),
    []
  );

  const goToToday = useCallback(
    () => setCurrentDay(startOfDay(new Date())),
    []
  );

  // ── Event handlers ──────────────────────────────────────────

  const refreshEvents = useCallback(async () => {
    const start = startOfDay(currentDay).toISOString();
    const end = endOfDay(currentDay).toISOString();
    const res = await fetch(`/api/events?start=${start}&end=${end}`);
    if (res.ok) setEvents(await res.json());
  }, [currentDay]);

  const handleSlotClick = useCallback((date: Date) => {
    setCreateDate(date);
    setShowEventModal(true);
    setPopoverEvent(null);
    setShowEventSidebar(false);
    setActiveTab("events");
  }, []);

  const handleEventClick = useCallback(
    (event: CalendarEvent, rect: DOMRect) => {
      if (event.originalId.startsWith("temp-")) {
        setEditingEvent(event);
        setShowEventSidebar(true);
        setPopoverEvent(null);
        setActiveTab("events");
      } else {
        setPopoverEvent(event);
        setPopoverRect(rect);
        setActiveTab("events");
      }
    },
    []
  );

  const handleSlotDragCreate = useCallback(
    (start: Date, end: Date, _day: Date) => {
      const tempId = `temp-${Date.now()}`;
      const optimisticEvent: CalendarEvent = {
        id: tempId,
        originalId: tempId,
        title: "New event",
        description: null,
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
      setActiveTab("events");
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
          prev.map((e) => (e.originalId === event.originalId ? updated : e))
        );
        setEditingEvent((prev) =>
          prev?.originalId === event.originalId ? updated : prev
        );
        return;
      }
      const res = await fetch(`/api/events/${event.originalId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        }),
      });
      if (res.ok) {
        await refreshEvents();
      }
    },
    [refreshEvents]
  );

  const handleEventMove = useCallback(
    async (event: CalendarEvent, startTime: Date, endTime: Date) => {
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
      const res = await fetch(`/api/events/${event.originalId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        }),
      });
      if (res.ok) {
        await refreshEvents();
      }
    },
    [refreshEvents]
  );

  const handleEventSaved = useCallback(
    async (_saved: CalendarEvent) => {
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

  const dayTodos = todos.filter((t) =>
    isSameDay(new Date(t.taskDate), currentDay)
  );
  const completedCount = dayTodos.filter((t) => t.completed).length;

  const containerStyle = backgroundUrl
    ? {
        backgroundImage: `url("${backgroundUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : undefined;

  return (
    <div
      className="flex flex-col flex-1 overflow-hidden bg-white dark:bg-gray-900"
      style={containerStyle}
    >
      {/* Navigation */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 shrink-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm">
        <button
          onClick={goToToday}
          className="px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
        >
          Today
        </button>
        <div className="flex items-center gap-0.5">
          <button
            onClick={goToPrevDay}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Previous day"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={goToNextDay}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Next day"
          >
            <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {format(currentDay, "EEEE")}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {format(currentDay, "MMMM d, yyyy")}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {loading && (
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 pt-3 pb-2 bg-white/90 dark:bg-gray-900/90 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>{format(currentDay, "EEEE, MMMM d")}</span>
          </div>
        </div>
        <div className="inline-flex bg-gray-100 dark:bg-gray-800 rounded-full p-0.5">
          <button
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
      <div className="flex-1 overflow-hidden bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
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
            {currentTime && (
              <TimeGrid
                scrollRef={scrollRef}
                weekDays={[currentDay]}
                currentTime={currentTime}
                events={events}
                onSlotClick={handleSlotClick}
                onEventClick={handleEventClick}
                onSlotDragCreate={handleSlotDragCreate}
                onEventResize={handleEventResize}
                onEventMove={handleEventMove}
              />
            )}
          </div>
        )}
      </div>

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
    </div>
  );
}

