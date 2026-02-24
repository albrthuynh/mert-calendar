"use client";

import { useState, useEffect, useCallback } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  addDays,
  format,
  isToday,
  isSameDay,
  isSameMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight, ListTodo } from "lucide-react";
import { EventFormModal } from "./EventFormModal";
import { EventDetailPopover } from "./EventDetailPopover";
import { TodoSidebar } from "./TodoSidebar";
import { ViewToggle, type ViewMode } from "./ViewToggle";
import { CalendarEvent, Todo } from "@/types/calendar";
import { fireCelebrationConfetti } from "@/lib/confetti";

interface MonthViewProps {
  onViewChange: (view: ViewMode) => void;
  backgroundUrl?: string;
}

function getCalendarDays(monthStart: Date): Date[] {
  const start = startOfWeek(monthStart, { weekStartsOn: 0 });
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function getEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);

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

function getTodosForDay(todos: Todo[], day: Date): Todo[] {
  return todos.filter((todo) => isSameDay(new Date(todo.taskDate), day));
}

export function MonthView({ onViewChange, backgroundUrl }: MonthViewProps) {
  const [currentMonth, setCurrentMonth] = useState<Date>(
    () => startOfMonth(new Date())
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);

  const [showEventModal, setShowEventModal] = useState(false);
  const [createDate, setCreateDate] = useState<Date | undefined>();
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | undefined>();
  const [popoverEvent, setPopoverEvent] = useState<CalendarEvent | null>(null);
  const [popoverRect, setPopoverRect] = useState<DOMRect | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = getCalendarDays(monthStart);

  const visibleStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const visibleEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  useEffect(() => {
    const start = visibleStart.toISOString();
    const end = visibleEnd.toISOString();

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
        /* empty */
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth]);

  const goToPrevMonth = useCallback(
    () => setCurrentMonth((m) => subMonths(m, 1)),
    []
  );
  const goToNextMonth = useCallback(
    () => setCurrentMonth((m) => addMonths(m, 1)),
    []
  );
  const goToToday = useCallback(
    () => setCurrentMonth(startOfMonth(new Date())),
    []
  );

  // ── Event handlers ──────────────────────────────────────────

  const handleDayClick = useCallback((day: Date) => {
    const d = new Date(day);
    d.setHours(9, 0, 0, 0);
    setCreateDate(d);
    setShowEventModal(true);
    setPopoverEvent(null);
  }, []);

  const handleEventClick = useCallback(
    (event: CalendarEvent, rect: DOMRect) => {
      setPopoverEvent(event);
      setPopoverRect(rect);
    },
    []
  );

  const refreshEvents = useCallback(async () => {
    const start = startOfWeek(monthStart, { weekStartsOn: 0 }).toISOString();
    const end = endOfWeek(monthEnd, { weekStartsOn: 0 }).toISOString();
    const res = await fetch(`/api/events?start=${start}&end=${end}`);
    if (res.ok) setEvents(await res.json());
  }, [monthStart, monthEnd]);

  const handleEventSaved = useCallback(
    async (_saved: CalendarEvent) => {
      await refreshEvents();
      setShowEventModal(false);
      setEditingEvent(undefined);
      setCreateDate(undefined);
    },
    [refreshEvents]
  );

  const handleDeleteEvent = useCallback(async () => {
    if (!popoverEvent) return;
    await fetch(`/api/events/${popoverEvent.originalId}`, {
      method: "DELETE",
    });
    setEvents((prev) =>
      prev.filter((e) => e.originalId !== popoverEvent.originalId)
    );
    setPopoverEvent(null);
  }, [popoverEvent]);

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
              ? { ...e, startTime: newStart.toISOString(), endTime: newEnd.toISOString() }
              : e
          )
        );
        setPopoverEvent((prev) =>
          prev && prev.originalId === event.originalId && prev.startTime === event.startTime
            ? { ...prev, startTime: newStart.toISOString(), endTime: newEnd.toISOString() }
            : prev
        );
        const start = visibleStart.toISOString();
        const end = visibleEnd.toISOString();
        const eventsRes = await fetch(`/api/events?start=${start}&end=${end}`);
        if (eventsRes.ok) setEvents(await eventsRes.json());
      }
    },
    [visibleStart, visibleEnd]
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
        if (
          completed &&
          next.length > 0 &&
          next.every((t) => t.completed)
        ) {
          queueMicrotask(() => fireCelebrationConfetti());
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

  // ── Derived data ──────────────────────────────────────────

  const weeks: Date[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  const monthLabel = format(currentMonth, "MMMM yyyy");

  const containerStyle = backgroundUrl
    ? {
        backgroundImage: `url("${backgroundUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : undefined;

  return (
    <div
      className="flex flex-col flex-1 overflow-hidden bg-white dark:bg-gray-900 min-h-0"
      style={containerStyle}
    >
      {/* Navigation */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 shrink-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
        <button
          onClick={goToToday}
          className="px-3 py-1.5 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
        >
          Today
        </button>
        <div className="flex items-center gap-0.5">
          <button
            onClick={goToPrevMonth}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={goToNextMonth}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
          {monthLabel}
        </h2>
        <div className="ml-auto flex items-center gap-2">
          {loading && (
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
          <ViewToggle currentView="month" onViewChange={onViewChange} />
          <button
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

      {/* Calendar + sidebar */}
      <div className="flex flex-1 overflow-hidden min-h-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
        <div className="flex flex-col flex-1 overflow-hidden min-h-0">
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0">
            {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => (
              <div
                key={d}
                className="text-center py-2 text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Month grid */}
          <div className="flex-1 grid grid-rows-6 overflow-hidden min-h-0">
            {weeks.map((week, weekIdx) => (
              <div
                key={weekIdx}
                className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 last:border-b-0 min-h-0"
              >
                {week.map((day) => {
                  const inMonth = isSameMonth(day, currentMonth);
                  const today = isToday(day);
                  const isSelected = selectedDay
                    ? isSameDay(day, selectedDay)
                    : false;
                  const dayEvents = getEventsForDay(events, day);
                  const dayTodos = getTodosForDay(todos, day);
                  const incompleteTodos = dayTodos.filter(
                    (t) => !t.completed
                  ).length;

                  return (
                    <div
                      key={day.toISOString()}
                      className={`border-r border-gray-200 dark:border-gray-700 last:border-r-0 flex flex-col min-h-0 overflow-hidden cursor-pointer transition-colors ${
                        inMonth
                          ? "bg-white dark:bg-gray-900"
                          : "bg-gray-50/80 dark:bg-gray-950/50"
                      } ${
                        isSelected
                          ? "ring-2 ring-inset ring-blue-400 dark:ring-blue-500"
                          : ""
                      } hover:bg-gray-50 dark:hover:bg-gray-800/50`}
                      onClick={() => handleDayClick(day)}
                    >
                      {/* Day number */}
                      <div className="flex items-center justify-between px-1.5 pt-1 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isSelected && showSidebar) {
                              setShowSidebar(false);
                              setSelectedDay(null);
                            } else {
                              setSelectedDay(day);
                              setShowSidebar(true);
                            }
                          }}
                          className={`w-7 h-7 flex items-center justify-center rounded-full text-sm transition-colors ${
                            today
                              ? "bg-blue-500 text-white font-semibold"
                              : inMonth
                              ? "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium"
                              : "text-gray-400 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                          }`}
                        >
                          {format(day, "d")}
                        </button>
                        {incompleteTodos > 0 && (
                          <span
                            className="w-2 h-2 rounded-full bg-amber-400 dark:bg-amber-500 shrink-0"
                            title={`${incompleteTodos} todo${incompleteTodos > 1 ? "s" : ""}`}
                          />
                        )}
                      </div>

                      {/* Events */}
                      <div className="flex-1 px-1 pb-0.5 space-y-px mt-0.5 overflow-y-auto min-h-0">
                        {dayEvents.map((event) => (
                          <button
                            key={event.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEventClick(
                                event,
                                e.currentTarget.getBoundingClientRect()
                              );
                            }}
                            className="w-full text-left rounded px-1.5 py-px text-[11px] truncate leading-snug hover:brightness-90 transition-all"
                            style={{
                              backgroundColor: `${event.color}20`,
                              color: event.color,
                              borderLeft: `2px solid ${event.color}`,
                            }}
                          >
                            {event.allDay
                              ? event.title
                              : `${format(new Date(event.startTime), "h:mm")} – ${format(new Date(event.endTime), "h:mm")} ${event.title}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Todo sidebar */}
        {showSidebar && selectedDay && (
          <TodoSidebar
            selectedDay={selectedDay}
            todos={todos}
            onClose={() => {
              setShowSidebar(false);
              setSelectedDay(null);
            }}
            onAdd={handleTodoAdd}
            onToggle={handleTodoToggle}
            onDelete={handleTodoDelete}
            onEdit={handleTodoEdit}
          />
        )}
      </div>

      {/* Create / Edit event modal */}
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

      {/* Event detail popover */}
      {popoverEvent && popoverRect && (
        <EventDetailPopover
          event={popoverEvent}
          anchorRect={popoverRect}
          onClose={() => setPopoverEvent(null)}
          onEdit={handleEditFromPopover}
          onDelete={handleDeleteEvent}
          onMoveTime={handleEventMoveTime}
        />
      )}
    </div>
  );
}
