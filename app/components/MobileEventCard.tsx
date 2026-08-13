"use client";

import { type CSSProperties } from "react";
import { format } from "date-fns";
import { Clock } from "lucide-react";
import { type CalendarEvent } from "@/types/calendar";

interface MobileEventCardProps {
  event: CalendarEvent;
  hasBackground: boolean;
  onClick: (event: CalendarEvent) => void;
}

function eventColorWithOpacity(color: string, opacity: number): string {
  const rgbMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
  if (!rgbMatch) return color;

  const red = parseInt(rgbMatch[1], 16);
  const green = parseInt(rgbMatch[2], 16);
  const blue = parseInt(rgbMatch[3], 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

export function MobileEventCard({
  event,
  hasBackground,
  onClick,
}: MobileEventCardProps) {
  const eventCardStyle = {
    borderLeftColor: event.color,
    backgroundColor: hasBackground
      ? undefined
      : eventColorWithOpacity(event.color, 0.05),
    "--event-card-bg-light": eventColorWithOpacity(event.color, 0.22),
    "--event-card-bg-dark": eventColorWithOpacity(event.color, 0.05),
  } as CSSProperties;

  return (
    <button
      type="button"
      onClick={() => onClick(event)}
      className={`w-full rounded-lg border-l-4 p-3 text-left transition-shadow hover:shadow-md ${
        hasBackground
          ? "bg-[var(--event-card-bg-light)] dark:bg-[var(--event-card-bg-dark)]"
          : "bg-white dark:bg-gray-800"
      }`}
      style={eventCardStyle}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {event.title}
          </h3>
          {event.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
              {event.description}
            </p>
          )}
        </div>
        {!event.allDay && (
          <div className="flex shrink-0 items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <Clock className="h-3.5 w-3.5" />
            <span className="font-medium">
              {format(new Date(event.startTime), "h:mm a")}
            </span>
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>
          {event.allDay
            ? "All day"
            : `${format(new Date(event.startTime), "h:mm a")} – ${format(
                new Date(event.endTime),
                "h:mm a"
              )}`}
        </span>
        {event.recurrenceRule && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] dark:bg-gray-700">
            Recurring
          </span>
        )}
      </div>
    </button>
  );
}
