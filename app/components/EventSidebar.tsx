"use client";

import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { X, Trash2 } from "lucide-react";
import { CalendarEvent } from "@/types/calendar";
import { ColorPicker } from "./ColorPicker";
import { RecurrenceSelector } from "./RecurrenceSelector";

interface EventSidebarProps {
  initialDate?: Date;
  initialStartTime?: Date;
  event?: CalendarEvent;
  onClose: () => void;
  onSave: (event: CalendarEvent) => void;
  onDelete?: () => void;
}

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function EventSidebar({
  initialDate,
  initialStartTime,
  event,
  onClose,
  onSave,
  onDelete,
}: EventSidebarProps) {
  const isEditing = !!event;

  const defaultStart = initialStartTime ?? initialDate ?? new Date();
  const defaultEnd = new Date(defaultStart.getTime() + 60 * 60 * 1000);

  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [startTime, setStartTime] = useState(
    toLocalDatetimeValue(event ? new Date(event.startTime) : defaultStart)
  );
  const [endTime, setEndTime] = useState(
    toLocalDatetimeValue(event ? new Date(event.endTime) : defaultEnd)
  );
  const [color, setColor] = useState(event?.color ?? "#4285F4");
  const [recurrenceRule, setRecurrenceRule] = useState(
    event?.recurrenceRule ?? ""
  );
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(
    event?.recurrenceEndDate
      ? format(new Date(event.recurrenceEndDate), "yyyy-MM-dd")
      : ""
  );
  const [reminderChoice, setReminderChoice] = useState<string>(() => {
    if (event?.reminderDisabled) return "none";
    if (event?.reminderMinutes === null || event?.reminderMinutes === undefined) return "default";
    return String(event.reminderMinutes);
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      requestAnimationFrame(() => setIsVisible(true));
    }
  }, []);

  const parseResponseBody = async (res: Response) => {
    const text = await res.text();
    if (!text) return { json: null as unknown, text: "" };
    try {
      return { json: JSON.parse(text) as unknown, text };
    } catch {
      return { json: null as unknown, text };
    }
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (new Date(startTime) >= new Date(endTime)) {
      setError("End time must be after start time.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const reminderDisabled = reminderChoice === "none";
      let reminderMinutes: number | null = null;
      if (reminderChoice !== "default" && reminderChoice !== "none") {
        const n = Number(reminderChoice);
        if (!Number.isFinite(n) || n < 0 || n > 10080) {
          setError("Reminder must be between 0 and 10080 minutes.");
          return;
        }
        reminderMinutes = Math.trunc(n);
      }

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        color,
        allDay: false,
        recurrenceRule: recurrenceRule || null,
        recurrenceEndDate: recurrenceEndDate
          ? new Date(recurrenceEndDate).toISOString()
          : null,
        reminderMinutes,
        reminderDisabled,
      };

      const isTempEvent = event?.originalId?.startsWith?.("temp-");
      const url = isEditing && !isTempEvent
        ? `/api/events/${event.originalId}`
        : "/api/events";
      const method = isEditing && !isTempEvent ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const { json, text } = await parseResponseBody(res);

      if (!res.ok) {
        const maybeErr =
          json && typeof json === "object" && json !== null
            ? (json as { error?: string }).error
            : undefined;
        throw new Error(
          maybeErr || (text ? text : `Failed to save event (${res.status})`)
        );
      }

      if (!json || typeof json !== "object") {
        throw new Error("Server returned an empty response while saving.");
      }

      const saved = json as Record<string, unknown>;
      onSave({
        ...saved,
        startTime: (saved.startTime ?? payload.startTime) as string,
        endTime: (saved.endTime ?? payload.endTime) as string,
        recurrenceEndDate: (saved.recurrenceEndDate ?? payload.recurrenceEndDate) as string | null,
        reminderMinutes: (saved.reminderMinutes ?? payload.reminderMinutes) as number | null,
        reminderDisabled: (saved.reminderDisabled ?? payload.reminderDisabled) as boolean,
        isRecurringInstance: false,
        originalId: String(saved.id),
      } as CalendarEvent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || !event) return;
    setDeleting(true);
    setError("");
    try {
      if (event.originalId.startsWith("temp-")) {
        onDelete();
        return;
      }
      const res = await fetch(`/api/events/${event.originalId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onDelete();
      } else {
        setError("Failed to delete event.");
      }
    } catch {
      setError("Failed to delete event.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Sidebar panel */}
      <div
        className={`fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-700 flex flex-col transition-transform duration-200 ease-out ${
          isVisible ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width: "min(400px, 100vw)" }}
      >
        {/* Color bar */}
        <div
          className="h-1.5 shrink-0"
          style={{ backgroundColor: color }}
        />
        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {isEditing ? "Edit event" : "New event"}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form
            onSubmit={handleSubmit}
            className="px-5 pb-6 flex flex-col gap-4 flex-1"
          >
            {/* Title */}
            <div>
              <input
                autoFocus
                type="text"
                placeholder="Add title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border-b-2 border-gray-200 dark:border-gray-700 focus:border-blue-500 outline-none text-lg font-medium py-2 placeholder-gray-400 dark:placeholder-gray-600 bg-transparent text-gray-900 dark:text-gray-100 transition-colors"
              />
            </div>

            {/* Start / End times */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 w-12 shrink-0">
                  Start
                </label>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 w-12 shrink-0">
                  End
                </label>
                <input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <textarea
                placeholder="Add description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Color */}
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                Color
              </p>
              <ColorPicker value={color} onChange={setColor} />
            </div>

            {/* Recurrence */}
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Repeat
              </p>
              <RecurrenceSelector
                value={recurrenceRule}
                onChange={setRecurrenceRule}
              />
              {recurrenceRule && (
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                    End repeat on
                  </label>
                  <input
                    type="date"
                    value={recurrenceEndDate}
                    onChange={(e) => setRecurrenceEndDate(e.target.value)}
                    className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            {/* Reminder */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Reminder
              </p>
              <select
                value={reminderChoice}
                onChange={(e) => setReminderChoice(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="default">Use default reminder</option>
                <option value="none">None</option>
                <option value="0">At start time</option>
                <option value="5">5 minutes before</option>
                <option value="10">10 minutes before</option>
                <option value="15">15 minutes before</option>
                <option value="30">30 minutes before</option>
                <option value="60">60 minutes before</option>
              </select>
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-4 mt-auto">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-60"
                >
                  {saving ? "Saving…" : isEditing ? "Save changes" : "Create event"}
                </button>
              </div>
              {isEditing && onDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-60"
                >
                  <Trash2 className="w-4 h-4" />
                  {deleting ? "Deleting…" : "Delete event"}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
