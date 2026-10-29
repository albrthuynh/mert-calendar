"use client";

import { useCalendarEventRefresh } from "../hooks/useCalendarEventRefresh";

import { useState, useEffect, useCallback, type CSSProperties } from "react";
import {
  startOfMonth,
  startOfWeek,
  startOfDay,
  endOfDay,
  addMonths,
  subMonths,
  addDays,
  format,
  isToday,
  isSameDay,
  isSameMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight, ListTodo, Star } from "lucide-react";
import { EventFormModal } from "./EventFormModal";
import { EventDetailPopover } from "./EventDetailPopover";
import { RecurringEventDeleteModal } from "./RecurringEventDeleteModal";
import { TodoSidebar } from "./TodoSidebar";
import { ViewToggle, type ViewMode } from "./ViewToggle";
import { CalendarEvent, ImportantDay, Todo } from "@/types/calendar";
import {
  ImportantDayEditorPopover,
  type ImportantDaySavePayload,
} from "./ImportantDayEditorPopover";
import { fireCelebrationConfetti } from "@/lib/confetti";
import { buildEventCopyPayload } from "@/lib/eventCopy";
import {
  buildEventDeleteRequest,
  type EventDeleteScope,
  removeDeletedEventFromList,
} from "@/lib/eventDelete";
import {
  fetchEventsForRange,
  fetchImportantDaysForRange,
  fetchTodosForRange,
  invalidateEventsCache,
  invalidateImportantDaysCache,
  invalidateTodosCache,
} from "@/lib/calendarDataCache";
import { useNotificationPreferences } from "../context/NotificationPreferencesContext";
import { useEventReminderScheduler } from "../hooks/useEventReminderScheduler";

interface MonthViewProps {
  onViewChange: (view: ViewMode) => void;
  backgroundUrl?: string;
}

function getCalendarDays(monthStart: Date): Date[] {
  const start = startOfWeek(monthStart, { weekStartsOn: 0 });

  const days: Date[] = [];
  let currentWeekStart = start;

  while (true) {
    const weekDays = Array.from({ length: 7 }, (_, i) =>
      addDays(currentWeekStart, i)
    );
    const weekHasMonthDay = weekDays.some((day) =>
      isSameMonth(day, monthStart)
    );

    if (weekHasMonthDay) {
      days.push(...weekDays);
    } else {
      break;
    }

    currentWeekStart = addDays(currentWeekStart, 7);
  }

  return days;
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

export function MonthView({ onViewChange, backgroundUrl }: MonthViewProps) {
  const [currentMonth, setCurrentMonth] = useState<Date>(
    () => startOfMonth(new Date())
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [importantDays, setImportantDays] = useState<ImportantDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);

  const [showEventModal, setShowEventModal] = useState(false);
  const [createDate, setCreateDate] = useState<Date | undefined>();
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | undefined>();
  const [popoverEvent, setPopoverEvent] = useState<CalendarEvent | null>(null);
  const [popoverRect, setPopoverRect] = useState<DOMRect | null>(null);
  const [recurringDeletePending, setRecurringDeletePending] =
    useState<CalendarEvent | null>(null);
  const [recurringDeleteBusy, setRecurringDeleteBusy] = useState(false);
  const [recurringDeleteError, setRecurringDeleteError] = useState<string | null>(null);
  const [importantDayEditor, setImportantDayEditor] = useState<{
    day: Date;
    anchorRect: DOMRect;
  } | null>(null);
  const notifPrefs = useNotificationPreferences();

  useEventReminderScheduler({ events, prefs: notifPrefs });

  const monthStart = startOfMonth(currentMonth);
  const calendarDays = getCalendarDays(monthStart);

  // Fetch range = full grid (including leading/trailing days from adjacent months)
  const gridFirstDay = calendarDays[0];
  const gridLastDay = calendarDays[calendarDays.length - 1];
  const fetchStart = startOfDay(gridFirstDay);
  const fetchEnd = endOfDay(gridLastDay);

  useEffect(() => {
    const start = fetchStart.toISOString();
    const end = fetchEnd.toISOString();

    const fetchAll = async () => {
      setLoading(true);
      try {
        const startKey = format(fetchStart, "yyyy-MM-dd");
        const endKey = format(fetchEnd, "yyyy-MM-dd");
        const [nextEvents, nextTodos, nextImportantDays] = await Promise.all([
          fetchEventsForRange(start, end),
          fetchTodosForRange(start, end),
          fetchImportantDaysForRange(startKey, endKey),
        ]);
        setEvents(nextEvents);
        setTodos(nextTodos);
        setImportantDays(nextImportantDays);
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
    },
    [popoverEvent]
  );

  const fetchStartIso = fetchStart.toISOString();
  const fetchEndIso = fetchEnd.toISOString();
  const refreshEvents = useCallback(async (options?: { force?: boolean }) => {
    setEvents(await fetchEventsForRange(fetchStartIso, fetchEndIso, options));
  }, [fetchStartIso, fetchEndIso]);

  useCalendarEventRefresh(refreshEvents);

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

  const handleEventSaved = useCallback(
    async () => {
      invalidateEventsCache();
      await refreshEvents({ force: true });
      setShowEventModal(false);
      setEditingEvent(undefined);
      setCreateDate(undefined);
    },
    [refreshEvents]
  );

  const handleDeleteFromPopover = useCallback(async () => {
    if (!popoverEvent) return;
    if (popoverEvent.isRecurringInstance && popoverEvent.recurrenceRule) {
      setRecurringDeletePending(popoverEvent);
      setRecurringDeleteError(null);
      setPopoverEvent(null);
      setPopoverRect(null);
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
            ? {
                ...prev,
                startTime: newStart.toISOString(),
                endTime: newEnd.toISOString(),
              }
            : prev
        );
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
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200/80 dark:border-white/[0.07] shrink-0 bg-white dark:bg-gray-900">
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
        <h2 className="text-[17px] font-semibold tracking-tight text-gray-800 dark:text-gray-100">
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
      <div className="flex flex-1 overflow-hidden min-h-0 bg-white/[0.98] dark:bg-gray-950/95">
        <div className="flex flex-col flex-1 overflow-hidden min-h-0">
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b border-gray-200/80 dark:border-white/[0.07] shrink-0">
            {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => (
              <div
                key={d}
                className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-500"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Month grid */}
          <div className="flex-1 grid auto-rows-fr overflow-hidden min-h-0">
            {weeks.map((week, weekIdx) => (
              <div
                key={weekIdx}
                className="grid grid-cols-7 border-b border-gray-200/80 dark:border-white/[0.07] last:border-b-0 min-h-0"
              >
                {week.map((day) => {
                  const inMonth = isSameMonth(day, currentMonth);
                  const today = isToday(day);
                  const isSelected = selectedDay
                    ? isSameDay(day, selectedDay)
                    : false;
                  const dayEvents = getEventsForDay(events, day);
                  const dateKey = format(day, "yyyy-MM-dd");
                  const importantRow = importantDays.find((d) => d.date === dateKey);
                  const importantLabel = importantRow
                    ? importantRow.label.trim()
                    : "";

                  return (
                    <div
                      key={day.toISOString()}
                      className={`group relative border-r border-gray-200/80 dark:border-white/[0.07] last:border-r-0 flex flex-col min-h-0 overflow-hidden cursor-pointer transition-colors ${
                        inMonth
                          ? today ? "bg-blue-50/40 dark:bg-blue-400/[0.035]" : "bg-transparent"
                          : "bg-gray-100/50 dark:bg-black/15"
                      } ${
                        isSelected
                          ? "ring-1 ring-inset ring-blue-400 dark:ring-blue-500"
                          : ""
                      } hover:bg-gray-50/60 dark:hover:bg-white/[0.025]`}
                      onClick={() => handleDayClick(day)}
                    >
                      {/* Day number + to-dos toggle */}
                      <div className="flex h-9 items-center justify-between gap-1 px-2 pt-1 shrink-0">
                        <div className="flex items-center gap-0.5 min-w-0">
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
                            aria-current={today ? "date" : undefined}
                            aria-label={format(day, "EEEE, MMMM d, yyyy")}
                            className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium tabular-nums transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
                              today
                                ? "bg-blue-600 text-white dark:bg-blue-500"
                                : inMonth
                                ? "text-gray-700 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-white/10"
                                : "text-gray-400 dark:text-gray-600 hover:bg-gray-200/70 dark:hover:bg-white/10"
                            }`}
                          >
                            {format(day, "d")}
                          </button>
                        </div>
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
                          className="rounded p-1 text-gray-400 transition-opacity shrink-0 hover:bg-blue-50 hover:text-blue-600 dark:text-gray-500 dark:hover:bg-white/5 dark:hover:text-gray-300 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-blue-500"
                          aria-label={isSelected && showSidebar ? "Close to-dos" : `View to-dos for ${format(day, "MMMM d")}`}
                          title={isSelected && showSidebar ? "Close to-dos" : "View to-dos"}
                        >
                          <ListTodo className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {importantLabel ? (
                        <button
                          type="button"
                          className="mx-2 mb-1 flex shrink-0 items-center gap-1.5 rounded px-1 py-1 text-left text-[11px] font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-white/5"
                          title={importantLabel}
                          onClick={(e) => {
                            e.stopPropagation();
                            setImportantDayEditor({
                              day,
                              anchorRect: e.currentTarget.getBoundingClientRect(),
                            });
                          }}
                        >
                          <span className="h-1 w-1 shrink-0 rounded-full bg-blue-500" aria-hidden />
                          <span className="truncate">{importantLabel}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="absolute right-8 top-2 rounded p-1 text-gray-400 transition-opacity hover:bg-blue-50 hover:text-blue-600 dark:text-gray-500 dark:hover:bg-white/5 dark:hover:text-gray-300 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-blue-500"
                          aria-label={`Mark important day for ${format(day, "MMMM d")}`}
                          title="Mark important day"
                          onClick={(e) => {
                            e.stopPropagation();
                            setImportantDayEditor({
                              day,
                              anchorRect: e.currentTarget.getBoundingClientRect(),
                            });
                          }}
                        >
                          <Star className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* Events */}
                      <div className="flex-1 px-2 pb-2 space-y-1 mt-1 overflow-y-auto min-h-0">
                        {dayEvents.map((event) => {
                          const timeLabel = event.allDay ? "All day" : format(new Date(event.startTime), "h:mm a");
                          const eventLabel = event.allDay
                            ? `${event.title} · All day`
                            : `${event.title} · ${format(new Date(event.startTime), "h:mm a")} – ${format(new Date(event.endTime), "h:mm a")}`;
                          return (
                            <button
                              key={`${event.id}-${event.instanceStartTime ?? event.startTime}`}
                              type="button"
                              data-event-trigger
                              title={eventLabel}
                              aria-label={eventLabel}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEventClick(
                                  event,
                                  e.currentTarget.getBoundingClientRect()
                                );
                              }}
                              className="month-event flex w-full min-w-0 items-center gap-2 rounded-md border-l-2 px-2 py-1 text-left leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500"
                              style={{
                                "--event-color": event.color,
                                borderLeftColor: event.color,
                              } as CSSProperties}
                            >
                              <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-800 dark:text-gray-100">{event.title}</span>
                              <span className="shrink-0 text-[10px] tabular-nums text-gray-500 dark:text-gray-400">{timeLabel}</span>
                            </button>
                          );
                        })}
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
            onUpdate={handleTodoUpdate}
          />
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
          onChooseFollowing={() => applyRecurringDelete("following")}
          onChooseAll={() => applyRecurringDelete("series")}
        />
      )}

      {/* Create / Edit event modal (day click or edit from popover) */}
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
          onCopyToDate={handleCopyEventToDate}
          onMoveTime={handleEventMoveTime}
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
