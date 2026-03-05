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
  /** Shift event time by delta minutes (positive = later). Only for non-recurring. */
  onMoveTime?: (event: CalendarEvent, deltaMinutes: number) => void;
}

function getRecurrenceLabel(rule: string): string {
  const match = RECURRENCE_OPTIONS.find((o) => o.value === rule);
  return match ? match.label : rule;
}

const MOVE_STEP_MINUTES = 30;

export function EventDetailPopover({
  event,
  anchorRect,
  onClose,
  onEdit,
  onDelete,
  onMoveTime,
}: EventDetailPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Position popover. On desktop, show beside the event.
  // On mobile, show above the event and clamp within the viewport.
  const ESTIMATED_HEIGHT = 280;
  const VIEWPORT_MARGIN = 8;
  const isMobile = window.innerWidth <= 768;

  const viewportTop = window.scrollY + VIEWPORT_MARGIN;
  const viewportBottom = window.scrollY + window.innerHeight - VIEWPORT_MARGIN;

  let top = 0;
  let left = 0;
  let width: number | undefined;
  const maxHeight = viewportBottom - viewportTop;

  if (isMobile) {
    // Try to position the popover *above* the event on mobile,
    // while still clamping it within the viewport.
    const idealTop = anchorRect.top + window.scrollY - ESTIMATED_HEIGHT - 8;
    const maxTop = viewportBottom - ESTIMATED_HEIGHT;
    top = Math.max(viewportTop, Math.min(idealTop, maxTop));

    // Make it span most of the screen width with side margins.
    width = window.innerWidth - VIEWPORT_MARGIN * 2;
    left = VIEWPORT_MARGIN;
  } else {
    // Desktop: position to the right of (or to the left of) the event block.
    const idealTop = anchorRect.top + window.scrollY;
    const maxTop = viewportBottom - ESTIMATED_HEIGHT;
    top = Math.max(viewportTop, Math.min(idealTop, maxTop));

    left =
      anchorRect.right + 8 + 280 > window.innerWidth
        ? anchorRect.left - 288
        : anchorRect.right + 8;
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (onMoveTime && !event.isRecurringInstance && !event.recurrenceRule) {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          onMoveTime(event, -MOVE_STEP_MINUTES);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          onMoveTime(event, MOVE_STEP_MINUTES);
          return;
        }
      }
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
  }, [onClose, onMoveTime, event]);

  const start = new Date(event.startTime);
  const end = new Date(event.endTime);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-72 overflow-hidden"
      style={{
        top,
        left,
        maxHeight,
        overflowY: "auto",
        width,
      }}
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
