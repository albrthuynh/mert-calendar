"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  addMinutes,
  differenceInMinutes,
  format,
  isSameDay,
  isToday,
  startOfDay,
} from "date-fns";
import { CalendarPlus, ListPlus } from "lucide-react";
import { type CalendarEvent, type Todo } from "@/types/calendar";
import { getEventsForDay } from "@/lib/calendarEventGrouping";
import { TodoItem } from "./TodoItem";
import { useLiveNow } from "../hooks/useLiveNow";

type MobileWeekAgendaTab = "todos" | "events";

interface MobileWeekAgendaProps {
  weekDays: Date[];
  selectedDay: Date;
  events: CalendarEvent[];
  todos: Todo[];
  activeTab: MobileWeekAgendaTab;
  hasBackground: boolean;
  onSelectDay: (day: Date) => void;
  onAddEvent: (day: Date) => void;
  onAddTodo: (day: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  onTodoToggle: (id: string, completed: boolean) => void;
  onTodoDelete: (id: string) => void;
  onTodoEdit: (id: string, title: string) => void;
  onTodoUpdate: (todo: Todo) => void;
}

interface PositionedEvent {
  event: CalendarEvent;
  laneIndex: number;
  laneCount: number;
}

const MOBILE_HOUR_HEIGHT = 56;
const TIME_GUTTER_WIDTH = 48;
const DAY_COLUMN_WIDTH = 112;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function getHourLabel(hour: number): string {
  if (hour === 0) return "";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function getEventBackground(color: string, opacity: number): string {
  const colorMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
  if (!colorMatch) return color;

  const red = parseInt(colorMatch[1], 16);
  const green = parseInt(colorMatch[2], 16);
  const blue = parseInt(colorMatch[3], 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function positionOverlappingEvents(events: CalendarEvent[]): PositionedEvent[] {
  const sortedEvents = [...events].sort(
    (firstEvent, secondEvent) =>
      new Date(firstEvent.startTime).getTime() -
      new Date(secondEvent.startTime).getTime()
  );
  const positionedEvents: PositionedEvent[] = [];
  let cluster: Array<{ event: CalendarEvent; laneIndex: number }> = [];
  let clusterEndTime = 0;

  const commitCluster = () => {
    if (cluster.length === 0) return;
    const laneCount = Math.max(...cluster.map(({ laneIndex }) => laneIndex)) + 1;
    positionedEvents.push(
      ...cluster.map(({ event, laneIndex }) => ({ event, laneIndex, laneCount }))
    );
    cluster = [];
  };

  for (const event of sortedEvents) {
    const eventStartTime = new Date(event.startTime).getTime();
    const eventEndTime = new Date(event.endTime).getTime();

    if (cluster.length > 0 && eventStartTime >= clusterEndTime) {
      commitCluster();
    }

    const occupiedLanes = new Set(
      cluster
        .filter(({ event: clusteredEvent }) =>
          new Date(clusteredEvent.endTime).getTime() > eventStartTime
        )
        .map(({ laneIndex }) => laneIndex)
    );
    let laneIndex = 0;
    while (occupiedLanes.has(laneIndex)) laneIndex += 1;

    cluster.push({ event, laneIndex });
    clusterEndTime = Math.max(clusterEndTime, eventEndTime);
  }

  commitCluster();
  return positionedEvents;
}

export function MobileWeekAgenda({
  weekDays,
  selectedDay,
  events,
  todos,
  activeTab,
  hasBackground,
  onSelectDay,
  onAddEvent,
  onAddTodo,
  onEventClick,
  onTodoToggle,
  onTodoDelete,
  onTodoEdit,
  onTodoUpdate,
}: MobileWeekAgendaProps) {
  const currentTime = useLiveNow();
  const weekGridScrollRef = useRef<HTMLDivElement>(null);
  const hasPositionedInitialTimeRef = useRef(false);
  const selectedDayIndex = Math.max(
    0,
    weekDays.findIndex((day) => isSameDay(day, selectedDay))
  );
  const weekGridWidth = TIME_GUTTER_WIDTH + DAY_COLUMN_WIDTH * weekDays.length;

  useEffect(() => {
    const scrollContainer = weekGridScrollRef.current;
    if (!scrollContainer || activeTab !== "events") return;

    const selectedColumnLeft = selectedDayIndex * DAY_COLUMN_WIDTH;
    const availableDayWidth = scrollContainer.clientWidth - TIME_GUTTER_WIDTH;
    scrollContainer.scrollLeft = Math.max(
      0,
      selectedColumnLeft - Math.max(0, (availableDayWidth - DAY_COLUMN_WIDTH) / 2)
    );
  }, [activeTab, selectedDayIndex]);

  useEffect(() => {
    const scrollContainer = weekGridScrollRef.current;
    if (
      !scrollContainer ||
      activeTab !== "events" ||
      hasPositionedInitialTimeRef.current
    ) {
      return;
    }

    const minutesSinceMidnight = currentTime
      ? currentTime.getHours() * 60 + currentTime.getMinutes()
      : 8 * 60;
    const currentTimeOffset = (minutesSinceMidnight / 60) * MOBILE_HOUR_HEIGHT;
    scrollContainer.scrollTop = Math.max(
      0,
      currentTimeOffset - scrollContainer.clientHeight * 0.35
    );
    hasPositionedInitialTimeRef.current = true;
  }, [activeTab, currentTime]);

  const eventsByDay = useMemo(
    () =>
      weekDays.map((day) => {
        const dayEvents = getEventsForDay(events, day);
        return {
          allDayEvents: dayEvents.filter((event) => event.allDay),
          timedEvents: positionOverlappingEvents(
            dayEvents.filter((event) => !event.allDay)
          ),
        };
      }),
    [events, weekDays]
  );

  if (activeTab === "todos") {
    return (
      <div className="h-full overflow-y-auto px-3 pb-6 pt-2">
        <div className="space-y-3">
          {weekDays.map((day) => {
            const dayTodos = todos.filter((todo) =>
              isSameDay(new Date(todo.taskDate), day)
            );
            const dayIsSelected = isSameDay(day, selectedDay);
            const dayIsToday = isToday(day);

            return (
              <section
                key={day.toISOString()}
                className={`overflow-hidden rounded-xl border bg-white/90 dark:bg-gray-900/90 ${
                  dayIsSelected
                    ? "border-blue-300 shadow-sm dark:border-blue-800"
                    : "border-gray-200 dark:border-gray-800"
                }`}
              >
                <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2.5 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => onSelectDay(day)}
                    className="flex min-w-0 items-center gap-2 text-left"
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
                        dayIsToday
                          ? "bg-blue-500 text-white"
                          : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {format(day, "EEEE")}
                      </span>
                      <span className="block text-[11px] text-gray-400 dark:text-gray-500">
                        {dayTodos.length} task{dayTodos.length === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onAddTodo(day)}
                    className="rounded-lg p-2 text-blue-500 transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/40"
                    aria-label={`Add task for ${format(day, "EEEE, MMMM d")}`}
                  >
                    <ListPlus className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-2 p-2.5">
                  {dayTodos.length > 0 ? (
                    dayTodos.map((todo) => (
                      <TodoItem
                        key={todo.id}
                        todo={todo}
                        onToggle={onTodoToggle}
                        onDelete={onTodoDelete}
                        onEdit={onTodoEdit}
                        onUpdate={onTodoUpdate}
                        variant="sidebar"
                      />
                    ))
                  ) : (
                    <p className="px-1 py-2 text-xs text-gray-400 dark:text-gray-500">
                      No tasks
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={weekGridScrollRef}
      className={`h-full overflow-auto overscroll-contain ${
        hasBackground
          ? "bg-white/75 dark:bg-gray-900/75"
          : "bg-white/90 dark:bg-gray-900/90"
      }`}
    >
      <div style={{ width: weekGridWidth }}>
        <div className="sticky top-0 z-40 bg-white/95 shadow-[0_1px_0_rgba(148,163,184,0.25)] backdrop-blur-md dark:bg-gray-900/95">
          <div className="flex h-[58px]">
            <div
              className={`sticky left-0 z-50 flex shrink-0 items-end justify-center bg-white/95 pb-2 text-[10px] font-medium uppercase tracking-wide backdrop-blur-md dark:bg-gray-900/95 ${
                hasBackground
                  ? "text-gray-700 dark:text-gray-200"
                  : "text-gray-400 dark:text-gray-500"
              }`}
              style={{ width: TIME_GUTTER_WIDTH }}
            >
              {format(weekDays[0], "MMM")}
            </div>
            {weekDays.map((day) => {
              const dayIsToday = isToday(day);
              const dayIsSelected = isSameDay(day, selectedDay);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => onSelectDay(day)}
                  className={`flex shrink-0 flex-col items-center justify-center border-l border-gray-100 transition-colors dark:border-gray-800 ${
                    dayIsSelected
                      ? "bg-blue-50/80 dark:bg-blue-950/30"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800/70"
                  }`}
                  style={{ width: DAY_COLUMN_WIDTH }}
                  aria-label={format(day, "EEEE, MMMM d")}
                >
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider ${
                      dayIsToday
                        ? "text-blue-600 dark:text-blue-400"
                        : hasBackground
                          ? "text-gray-800 dark:text-gray-100"
                          : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {format(day, "EEE")}
                  </span>
                  <span
                    className={`mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
                      dayIsToday
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-gray-800 dark:text-gray-100"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex min-h-[46px] border-t border-gray-100 dark:border-gray-800">
            <div
              className={`sticky left-0 z-50 flex shrink-0 items-center justify-center bg-white/95 text-[9px] font-medium uppercase tracking-wider backdrop-blur-md dark:bg-gray-900/95 ${
                hasBackground
                  ? "text-gray-700 dark:text-gray-200"
                  : "text-gray-400 dark:text-gray-500"
              }`}
              style={{ width: TIME_GUTTER_WIDTH }}
            >
              all-day
            </div>
            {weekDays.map((day, dayIndex) => {
              const allDayEvents = eventsByDay[dayIndex].allDayEvents;
              return (
                <div
                  key={day.toISOString()}
                  className="min-h-[46px] shrink-0 border-l border-gray-100 px-1 py-1 dark:border-gray-800"
                  style={{ width: DAY_COLUMN_WIDTH }}
                >
                  {allDayEvents.slice(0, 2).map((event) => (
                    <button
                      key={`${event.originalId}-${event.startTime}`}
                      type="button"
                      onClick={() => onEventClick(event)}
                      className="mb-0.5 block h-[17px] w-full truncate rounded px-1 text-left text-[9px] font-semibold text-white"
                      style={{ backgroundColor: event.color }}
                    >
                      {event.title}
                    </button>
                  ))}
                  {allDayEvents.length > 2 && (
                    <span
                      className={`block px-1 text-[9px] ${
                        hasBackground
                          ? "font-semibold text-gray-800 dark:text-gray-100"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      +{allDayEvents.length - 2} more
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex">
          <div
            className="sticky left-0 z-30 shrink-0 bg-white/95 backdrop-blur-md dark:bg-gray-900/95"
            style={{ width: TIME_GUTTER_WIDTH, height: MOBILE_HOUR_HEIGHT * 24 }}
          >
            {HOURS.map((hour) => (
              <span
                key={hour}
                className={`absolute right-2 -translate-y-1/2 text-[10px] tabular-nums ${
                  hasBackground
                    ? "font-semibold text-gray-800 dark:text-gray-100"
                    : "text-gray-400 dark:text-gray-500"
                }`}
                style={{ top: hour * MOBILE_HOUR_HEIGHT }}
              >
                {getHourLabel(hour)}
              </span>
            ))}
          </div>

          {weekDays.map((day, dayIndex) => {
            const dayIsSelected = isSameDay(day, selectedDay);
            const dayIsToday = isToday(day);
            return (
              <div
                key={day.toISOString()}
                className={`relative shrink-0 border-l border-gray-200 dark:border-gray-700 ${
                  dayIsSelected ? "bg-blue-50/20 dark:bg-blue-950/10" : ""
                }`}
                style={{ width: DAY_COLUMN_WIDTH, height: MOBILE_HOUR_HEIGHT * 24 }}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("button")) return;
                  const columnBounds = event.currentTarget.getBoundingClientRect();
                  const clickedMinutes = Math.max(
                    0,
                    Math.min(
                      23 * 60 + 30,
                      Math.round(
                        ((event.clientY - columnBounds.top) / MOBILE_HOUR_HEIGHT) * 2
                      ) * 30
                    )
                  );
                  onSelectDay(day);
                  onAddEvent(addMinutes(startOfDay(day), clickedMinutes));
                }}
              >
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute inset-x-0 border-t border-gray-100 dark:border-gray-800"
                    style={{ top: hour * MOBILE_HOUR_HEIGHT }}
                  />
                ))}

                {eventsByDay[dayIndex].timedEvents.map(
                  ({ event, laneIndex, laneCount }) => {
                    const dayStart = startOfDay(day);
                    const eventStart = new Date(event.startTime);
                    const eventEnd = new Date(event.endTime);
                    const visibleStart = eventStart < dayStart ? dayStart : eventStart;
                    const visibleEnd = addMinutes(dayStart, 24 * 60) < eventEnd
                      ? addMinutes(dayStart, 24 * 60)
                      : eventEnd;
                    const startMinutes = differenceInMinutes(visibleStart, dayStart);
                    const durationMinutes = Math.max(
                      20,
                      differenceInMinutes(visibleEnd, visibleStart)
                    );
                    const eventTop = (startMinutes / 60) * MOBILE_HOUR_HEIGHT;
                    const eventHeight = Math.max(
                      22,
                      (durationMinutes / 60) * MOBILE_HOUR_HEIGHT
                    );
                    const eventWidth = 100 / laneCount;

                    return (
                      <button
                        key={`${event.originalId}-${event.startTime}`}
                        type="button"
                        onClick={() => onEventClick(event)}
                        className={`absolute z-10 overflow-hidden rounded-[4px] border-l-[3px] px-1 py-0.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition-[filter,transform] active:scale-[0.98] active:brightness-95 ${
                          hasBackground ? "text-gray-950 dark:text-white" : ""
                        }`}
                        style={{
                          top: eventTop,
                          height: eventHeight,
                          left: `calc(${laneIndex * eventWidth}% + 2px)`,
                          width: `calc(${eventWidth}% - 3px)`,
                          borderLeftColor: event.color,
                          backgroundColor: hasBackground
                            ? getEventBackground(event.color, 0.5)
                            : getEventBackground(event.color, 0.17),
                          color: hasBackground ? undefined : event.color,
                        }}
                        aria-label={`${event.title}, ${format(eventStart, "h:mm a")}`}
                      >
                        <span className="block truncate text-[10px] font-bold leading-[1.2]">
                          {event.title}
                        </span>
                        {eventHeight >= 34 && (
                          <span className="mt-0.5 block truncate text-[9px] font-medium leading-none opacity-80">
                            {format(eventStart, "h:mm a")}
                          </span>
                        )}
                      </button>
                    );
                  }
                )}

                {dayIsToday && currentTime && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                    style={{
                      top:
                        ((currentTime.getHours() * 60 + currentTime.getMinutes()) /
                          60) *
                        MOBILE_HOUR_HEIGHT,
                    }}
                  >
                    <span className="-ml-1 h-2 w-2 rounded-full bg-red-500" />
                    <span className="h-px flex-1 bg-red-500" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onAddEvent(selectedDay)}
        className="absolute bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-[0_8px_24px_rgba(37,99,235,0.35)] transition active:scale-95 dark:bg-blue-500"
        aria-label={`Add event for ${format(selectedDay, "EEEE, MMMM d")}`}
      >
        <CalendarPlus className="h-5 w-5" />
      </button>
    </div>
  );
}
