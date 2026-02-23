"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
import { EventFormModal } from "./EventFormModal";
import { EventDetailPopover } from "./EventDetailPopover";
import { TodoSection } from "./TodoSection";
import { TodoSidebar } from "./TodoSidebar";
import { ViewToggle, type ViewMode } from "./ViewToggle";
import { CalendarEvent, Todo } from "@/types/calendar";
import { HOUR_HEIGHT } from "@/lib/calendarConstants";

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
  // Initialize currentTime on the client after mount to avoid
  // server/client time mismatches affecting the red line position.
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);

  // Modal / popover state
  const [showEventModal, setShowEventModal] = useState(false);
  const [createDate, setCreateDate] = useState<Date | undefined>();
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | undefined>();
  const [popoverEvent, setPopoverEvent] = useState<CalendarEvent | null>(null);
  const [popoverRect, setPopoverRect] = useState<DOMRect | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Live clock
  useEffect(() => {
    // Set immediately on mount, then update every minute
    setCurrentTime(new Date());
    const interval = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to current time on first mount
  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const scrollTo = Math.max(0, (now.getHours() - 1) * HOUR_HEIGHT);
      scrollRef.current.scrollTop = scrollTo;
    }
  }, []);

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Fetch events + todos whenever the visible week changes
  useEffect(() => {
    const start = weekStart.toISOString();
    const end = weekEnd.toISOString();

    const fetchAll = async () => {
      setLoadingEvents(true);
      try {
        const [eventsRes, todosRes] = await Promise.all([
          fetch(`/api/events?start=${start}&end=${end}`),
          fetch(`/api/todos?start=${start}&end=${end}`),
        ]);
        if (eventsRes.ok) setEvents(await eventsRes.json());
        if (todosRes.ok) setTodos(await todosRes.json());
      } catch {
        // Silently fail; user will see empty state
      } finally {
        setLoadingEvents(false);
      }
    };

    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

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
  }, []);

  const handleEventClick = useCallback(
    (event: CalendarEvent, rect: DOMRect) => {
      setPopoverEvent(event);
      setPopoverRect(rect);
    },
    []
  );

  const refreshEvents = useCallback(async () => {
    const start = weekStart.toISOString();
    const end = weekEnd.toISOString();
    const res = await fetch(`/api/events?start=${start}&end=${end}`);
    if (res.ok) setEvents(await res.json());
  }, [weekStart, weekEnd]);

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

  // ── Todo handlers ──────────────────────────────────────────
  const handleTodoAdd = useCallback((todo: Todo) => {
    setTodos((prev) => [...prev, todo]);
  }, []);

  const handleTodoToggle = useCallback(async (id: string, completed: boolean) => {
    // Optimistic update
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed } : t))
    );
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
      className="flex flex-col flex-1 overflow-hidden bg-white dark:bg-gray-900 min-h-0"
      style={containerStyle}
    >
      {/* Week navigation */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 shrink-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
        <button
          onClick={goToToday}
          className="px-3 py-1.5 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
        >
          Today
        </button>
        <div className="flex items-center gap-0.5">
          <button
            onClick={goToPrevWeek}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <button
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
      <div className="flex flex-1 overflow-hidden bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
      <div className="flex flex-col flex-1 overflow-hidden">

      {/* Day headers + todo sections */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0">
        {/* Time gutter spacer */}
        <div className="w-14 shrink-0 flex flex-col">
          <div className="h-[60px]" />
        </div>

        {weekDays.map((day) => {
          const today = isToday(day);
          const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
          return (
            <div
              key={day.toISOString()}
              className="flex-1 flex flex-col border-l border-gray-200 dark:border-gray-700 min-w-0"
            >
              {/* Date header — click to open/toggle todo sidebar */}
              <button
                onClick={() => {
                  if (isSelected && showSidebar) {
                    setShowSidebar(false);
                    setSelectedDay(null);
                  } else {
                    setSelectedDay(day);
                    setShowSidebar(true);
                  }
                }}
                className="flex flex-col items-center py-2 h-[60px] justify-center w-full hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <span
                  className={`text-xs font-medium uppercase tracking-wider ${
                    today ? "text-blue-500" : isSelected ? "text-blue-400" : "text-gray-400 dark:text-gray-500"
                  }`}
                >
                  {format(day, "EEE")}
                </span>
                <div
                  className={`w-9 h-9 flex items-center justify-center rounded-full mt-0.5 text-sm font-semibold ${
                    today
                      ? "bg-blue-500 text-white"
                      : isSelected
                      ? "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  {format(day, "d")}
                </div>
              </button>

              {/* Per-day todo section */}
              <TodoSection
                day={day}
                todos={todos}
                onAdd={handleTodoAdd}
                onToggle={handleTodoToggle}
                onDelete={handleTodoDelete}
                onEdit={handleTodoEdit}
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
        />
      )}
      </div>{/* end calendar + sidebar wrapper */}

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
        />
      )}
    </div>
  );
}
