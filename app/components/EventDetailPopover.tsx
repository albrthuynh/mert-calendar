"use client";

import { useEffect, useRef } from "react";
import { format } from "date-fns";
import { X, Pencil, Trash2, RotateCcw } from "lucide-react";
import { CalendarEvent, RECURRENCE_OPTIONS } from "@/types/calendar";

interface EventDetailPopoverProps {
  event: CalendarEvent;
  anchorRect: DOMRect;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function getRecurrenceLabel(rule: string): string {
  const match = RECURRENCE_OPTIONS.find((o) => o.value === rule);
  return match ? match.label : rule;
}

export function EventDetailPopover({
  event,
  anchorRect,
  onClose,
  onEdit,
  onDelete,
}: EventDetailPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Position popover to the right of (or below) the event block
  const top = Math.min(
    anchorRect.top + window.scrollY,
    window.innerHeight - 280
  );
  const left =
    anchorRect.right + 8 + 280 > window.innerWidth
      ? anchorRect.left - 288
      : anchorRect.right + 8;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  const start = new Date(event.startTime);
  const end = new Date(event.endTime);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-72 overflow-hidden"
      style={{ top, left }}
    >
      {/* Color bar + close */}
      <div
        className="h-2 w-full"
        style={{ backgroundColor: event.color }}
      />
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-tight">
            {event.title}
          </h3>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onEdit}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Time */}
        <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          <span>{format(start, "EEEE, MMMM d")}</span>
          <br />
          <span>
            {format(start, "h:mm a")} – {format(end, "h:mm a")}
          </span>
        </div>

        {/* Recurrence */}
        {event.recurrenceRule && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-2">
            <RotateCcw className="w-3 h-3" />
            <span>{getRecurrenceLabel(event.recurrenceRule)}</span>
            {event.recurrenceEndDate && (
              <span>
                · until{" "}
                {format(new Date(event.recurrenceEndDate), "MMM d, yyyy")}
              </span>
            )}
          </div>
        )}

        {/* Description */}
        {event.description && (
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 leading-relaxed border-t border-gray-100 dark:border-gray-700/50 pt-2">
            {event.description}
          </p>
        )}
      </div>
    </div>
  );
}
