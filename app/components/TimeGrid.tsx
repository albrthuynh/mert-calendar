"use client";

import { RefObject } from "react";
import { isToday, isSameDay, startOfDay } from "date-fns";
import { HOUR_HEIGHT } from "@/lib/calendarConstants";
import { CalendarEvent } from "@/types/calendar";
import { EventBlock } from "./EventBlock";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function hourLabel(hour: number): string {
  if (hour === 0) return "";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

/** Group overlapping events into columns so they don't completely overlap. */
function layoutEvents(events: CalendarEvent[]): Array<{
  event: CalendarEvent;
  column: number;
  totalColumns: number;
}> {
  if (events.length === 0) return [];

  const sorted = [...events].sort(
    (a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  type LayoutItem = {
    event: CalendarEvent;
    column: number;
    totalColumns: number;
  };

  const result: LayoutItem[] = [];
  // Groups of overlapping events
  const groups: CalendarEvent[][] = [];

  for (const event of sorted) {
    const eStart = new Date(event.startTime).getTime();
    const eEnd = new Date(event.endTime).getTime();
    let placed = false;

    for (const group of groups) {
      const groupEnd = Math.max(
        ...group.map((g) => new Date(g.endTime).getTime())
      );
      if (eStart < groupEnd) {
        group.push(event);
        placed = true;
        break;
      }
    }

    if (!placed) groups.push([event]);
  }

  for (const group of groups) {
    const cols: CalendarEvent[][] = [];
    for (const event of group) {
      const eStart = new Date(event.startTime).getTime();
      let placed = false;
      for (const col of cols) {
        const colEnd = Math.max(
          ...col.map((c) => new Date(c.endTime).getTime())
        );
        if (eStart >= colEnd) {
          col.push(event);
          placed = true;
          break;
        }
      }
      if (!placed) cols.push([event]);
    }

    const total = cols.length;
    cols.forEach((col, colIdx) => {
      col.forEach((event) => {
        result.push({ event, column: colIdx, totalColumns: total });
      });
    });
  }

  return result;
}

interface TimeGridProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  weekDays: Date[];
  currentTime: Date;
  events: CalendarEvent[];
  onSlotClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent, rect: DOMRect) => void;
}

export function TimeGrid({
  scrollRef,
  weekDays,
  currentTime,
  events,
  onSlotClick,
  onEventClick,
}: TimeGridProps) {
  const currentTimeTop =
    ((currentTime.getHours() * 60 + currentTime.getMinutes()) / 60) *
    HOUR_HEIGHT;

  const handleColumnClick = (e: React.MouseEvent<HTMLDivElement>, day: Date) => {
    if ((e.target as HTMLElement).closest("[data-event]")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const totalMinutes = (y / HOUR_HEIGHT) * 60;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round((totalMinutes % 60) / 30) * 30;
    const clickedDate = new Date(startOfDay(day));
    clickedDate.setHours(hours, minutes, 0, 0);
    onSlotClick(clickedDate);
  };

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
      <div
        className="flex relative"
        style={{ height: `${HOUR_HEIGHT * 24}px` }}
      >
        {/* Time labels */}
        <div className="w-14 shrink-0 relative select-none">
          {HOURS.map((hour) => (
        <div
            key={hour}
            className="absolute right-2 text-xs text-gray-400 dark:text-gray-600 leading-none"
            style={{ top: `${hour * HOUR_HEIGHT - 7}px` }}
          >
              {hourLabel(hour)}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {weekDays.map((day) => {
          const today = isToday(day);
          const dayEvents = events.filter((ev) =>
            isSameDay(new Date(ev.startTime), day)
          );
          const laid = layoutEvents(dayEvents);

          return (
            <div
              key={day.toISOString()}
              className="flex-1 border-l border-gray-200 dark:border-gray-700 relative cursor-pointer"
              onClick={(e) => handleColumnClick(e, day)}
            >
              {/* Hour grid lines */}
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 border-t border-gray-100 dark:border-gray-800"
                  style={{ top: `${hour * HOUR_HEIGHT}px` }}
                />
              ))}

              {/* Half-hour lines */}
              {HOURS.map((hour) => (
                <div
                  key={`h-${hour}`}
                  className="absolute left-0 right-0 border-t border-gray-50 dark:border-gray-800/50"
                  style={{
                    top: `${hour * HOUR_HEIGHT + HOUR_HEIGHT / 2}px`,
                  }}
                />
              ))}

              {/* Event blocks */}
              {laid.map(({ event, column, totalColumns }) => (
                <div key={`${event.originalId}-${event.startTime}`} data-event>
                  <EventBlock
                    event={event}
                    dayStart={day}
                    columnIndex={column}
                    totalColumns={totalColumns}
                    onClick={onEventClick}
                  />
                </div>
              ))}

              {/* Current time indicator (today only) */}
              {today && (
                <div
                  className="absolute left-0 right-0 z-20 pointer-events-none"
                  style={{ top: `${currentTimeTop}px` }}
                >
                  <div className="flex items-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 -ml-1.5" />
                    <div className="flex-1 h-px bg-red-500" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
