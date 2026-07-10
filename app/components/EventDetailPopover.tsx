"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Lock,
  X,
  Pencil,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { CalendarEvent, RECURRENCE_OPTIONS } from "@/types/calendar";
import { parseDateInputValue } from "@/lib/eventCopy";

interface EventDetailPopoverProps {
  event: CalendarEvent;
  anchorRect: DOMRect;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopyToDate?: (event: CalendarEvent, targetDay: Date) => Promise<void> | void;
  /** Shift event time by delta minutes (positive = later). Only for non-recurring. */
  onMoveTime?: (event: CalendarEvent, deltaMinutes: number) => void;
}

function getRecurrenceLabel(rule: string): string {
  const match = RECURRENCE_OPTIONS.find((o) => o.value === rule);
  return match ? match.label : rule;
}

const MOVE_STEP_MINUTES = 30;
/** Desktop popover width in px — keep in sync with Tailwind width class below. */
const POPOVER_WIDTH = 320; // w-80

export function EventDetailPopover({
  event,
  anchorRect,
  onClose,
  onEdit,
  onDelete,
  onCopyToDate,
  onMoveTime,
}: EventDetailPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [showCopyControls, setShowCopyControls] = useState(false);
  const [copyDate, setCopyDate] = useState(() =>
    format(new Date(event.startTime), "yyyy-MM-dd")
  );
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);

  // Position popover. On desktop, show beside the event.
  // On mobile, show above the event and clamp within the viewport.
  const ESTIMATED_HEIGHT = 320;
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
      anchorRect.right + 8 + POPOVER_WIDTH > window.innerWidth
        ? anchorRect.left - (POPOVER_WIDTH + 8)
        : anchorRect.right + 8;
  }

  useEffect(() => {
    setShowCopyControls(false);
    setCopyDate(format(new Date(event.startTime), "yyyy-MM-dd"));
    setCopyError("");
    setCopySuccess(false);
  }, [event.originalId, event.startTime]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (
        onMoveTime &&
        !event.readOnly &&
        !event.isRecurringInstance &&
        !event.recurrenceRule
      ) {
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
      const target = e.target as HTMLElement;
      if (target.closest("[data-event-trigger]")) return;
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

  const handleCopy = async () => {
    if (!onCopyToDate) return;

    const targetDay = parseDateInputValue(copyDate);
    if (!targetDay) {
      setCopyError("Choose a valid date.");
      setCopySuccess(false);
      return;
    }

    setCopying(true);
    setCopyError("");
    setCopySuccess(false);
    try {
      await onCopyToDate(event, targetDay);
      setCopySuccess(true);
    } catch (error) {
      setCopyError(
        error instanceof Error ? error.message : "Could not copy event."
      );
    } finally {
      setCopying(false);
    }
  };

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-80 overflow-hidden"
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
      <div className="px-5 pt-4 pb-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base leading-tight">
            {event.title}
          </h3>
          <div className="flex items-center gap-1 shrink-0">
            {onCopyToDate && (
              <button
                type="button"
                onClick={() => {
                  setShowCopyControls((value) => !value);
                  setCopyError("");
                  setCopySuccess(false);
                }}
                className={`p-1 rounded transition-colors ${
                  showCopyControls
                    ? "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                }`}
                title="Copy"
                aria-label="Copy event"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            )}
            {!event.readOnly && (
              <>
                <button
                  type="button"
                  onClick={onEdit}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Time */}
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          <span>{format(start, "EEEE, MMMM d")}</span>
          <br />
          <span>
            {format(start, "h:mm a")} – {format(end, "h:mm a")}
          </span>
        </div>

        {showCopyControls && onCopyToDate && (
          <div className="mb-3 border-y border-gray-100 py-2.5 dark:border-gray-800">
            <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Copy to date
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={copyDate}
                onChange={(e) => {
                  setCopyDate(e.target.value);
                  setCopyError("");
                  setCopySuccess(false);
                }}
                className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              />
              <button
                type="button"
                onClick={handleCopy}
                disabled={copying}
                className="inline-flex h-8 min-w-16 items-center justify-center gap-1.5 rounded-lg bg-blue-500 px-3 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-60"
              >
                {copying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : copySuccess ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  "Copy"
                )}
              </button>
            </div>
            {copyError && (
              <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                {copyError}
              </p>
            )}
            {copySuccess && !copyError && (
              <p className="mt-1.5 text-xs text-blue-600 dark:text-blue-300">
                Copied.
              </p>
            )}
          </div>
        )}

        {event.readOnly && (
          <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Lock className="h-3 w-3" />
            <span>Read-only · from a synced Google calendar</span>
          </div>
        )}

        {/* Recurrence */}
        {event.recurrenceRule && (
          <div className="mb-2 grid grid-cols-[0.75rem_minmax(0,1fr)] gap-2 text-sm text-gray-500 dark:text-gray-400">
            <RotateCcw className="mt-0.5 h-3 w-3" />
            <p className="min-w-0 leading-snug">
              <span>{getRecurrenceLabel(event.recurrenceRule)}</span>
              {event.recurrenceEndDate && (
                <span>
                  {" "}
                  · until{" "}
                  {format(new Date(event.recurrenceEndDate), "MMM d, yyyy")}
                </span>
              )}
            </p>
          </div>
        )}

        {/* Description */}
        {event.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 leading-relaxed border-t border-gray-100 dark:border-gray-700/50 pt-2">
            {event.description}
          </p>
        )}

        {event.link && (
          <a
            href={event.link}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            <span className="truncate">Open link</span>
          </a>
        )}
      </div>
    </div>
  );
}
