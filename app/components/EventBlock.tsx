"use client";

import { CalendarEvent } from "@/types/calendar";
import { HOUR_HEIGHT } from "@/lib/calendarConstants";
import { format } from "date-fns";
import { RotateCcw } from "lucide-react";

interface EventBlockProps {
  event: CalendarEvent;
  dayStart: Date;
  columnIndex: number;
  totalColumns: number;
  /** Override displayed position/size during drag preview */
  overrideStart?: Date;
  overrideEnd?: Date;
  /** Style as a preview (semi-transparent) during drag */
  isPreview?: boolean;
  hasBackground?: boolean;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

const RESIZE_HANDLE_HEIGHT = 8;

export function EventBlock({
  event,
  dayStart,
  columnIndex,
  totalColumns,
  overrideStart,
  overrideEnd,
  isPreview = false,
  hasBackground = false,
}: EventBlockProps) {
  const start = overrideStart ?? new Date(event.startTime);
  const end = overrideEnd ?? new Date(event.endTime);

  // Minutes since midnight of this day
  const startOfDay = new Date(dayStart);
  startOfDay.setHours(0, 0, 0, 0);

  const startMinutes =
    (start.getTime() - startOfDay.getTime()) / 60000;
  const endMinutes =
    (end.getTime() - startOfDay.getTime()) / 60000;

  const top = (startMinutes / 60) * HOUR_HEIGHT;
  const height = Math.max(((endMinutes - startMinutes) / 60) * HOUR_HEIGHT, 20);

  const widthPct = 100 / totalColumns;
  const leftPct = columnIndex * widthPct;

  const rgb = hexToRgb(event.color);
  const bgColor = rgb
    ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${isPreview ? 0.5 : 0.15})`
    : `${event.color}${isPreview ? "80" : "25"}`;
  const borderColor = event.color;

  const isShort = height < 40;
  const isRecurring = event.isRecurringInstance || Boolean(event.recurrenceRule);
  const canResize = !isRecurring;

  return (
    <div
      className={`absolute rounded-md px-1.5 py-0.5 overflow-hidden hover:brightness-95 transition-all group select-none ${
        isRecurring ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${isPreview ? "shadow-lg" : ""}`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        backgroundColor: bgColor,
        borderLeft: `3px solid ${borderColor}`,
        zIndex: 10,
      }}
    >
      {/* Top resize handle - hit area for TimeGrid to detect */}
      {canResize && height > RESIZE_HANDLE_HEIGHT * 2 && (
        <div
          data-resize="start"
          className="absolute left-0 right-0 top-0 cursor-n-resize z-10"
          style={{ height: RESIZE_HANDLE_HEIGHT }}
        />
      )}

      <p
        className={`text-xs font-semibold leading-tight truncate ${
          hasBackground ? "text-black dark:text-white" : ""
        }`}
        style={{ color: hasBackground ? undefined : event.color }}
      >
        {event.title}
      </p>
      {!isShort && (
        <p
          className={`text-xs leading-tight truncate ${
            hasBackground ? "text-black/85 dark:text-white/85" : "opacity-70"
          }`}
          style={{ color: hasBackground ? undefined : event.color }}
        >
          {format(start, "h:mm a")} – {format(end, "h:mm a")}
          {event.recurrenceRule && (
            <RotateCcw className="inline w-2.5 h-2.5 ml-0.5 opacity-60" />
          )}
        </p>
      )}

      {/* Bottom resize handle */}
      {canResize && height > RESIZE_HANDLE_HEIGHT * 2 && (
        <div
          data-resize="end"
          className="absolute left-0 right-0 bottom-0 cursor-n-resize z-10"
          style={{ height: RESIZE_HANDLE_HEIGHT }}
        />
      )}
    </div>
  );
}
