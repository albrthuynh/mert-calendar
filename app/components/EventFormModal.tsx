"use client";

import { useEffect, useId, useRef, useState } from "react";
import { format } from "date-fns";
import { Link, X } from "lucide-react";
import { CalendarEvent } from "@/types/calendar";
import { ColorPicker } from "./ColorPicker";
import { RecurrenceSelector } from "./RecurrenceSelector";
import { DesktopDateTimeInput } from "./DesktopDateTimeInput";

interface EventFormModalProps {
  initialDate?: Date;
  initialStartTime?: Date;
  event?: CalendarEvent;
  onClose: () => void;
  onSave: (event: CalendarEvent) => void;
}

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function EventFormModal({
  initialDate,
  initialStartTime,
  event,
  onClose,
  onSave,
}: EventFormModalProps) {
  const isEditing = !!event;
  const canChooseRecurringEditScope = Boolean(
    isEditing && event?.isRecurringInstance && event?.recurrenceRule
  );
  const startTimeInputId = useId();
  const endTimeInputId = useId();
  const recurrenceEndDateInputId = useId();
  const editScopeName = useId();
  const editScopeSingleId = useId();
  const editScopeSeriesId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);

  const defaultStart = initialStartTime ?? initialDate ?? new Date();
  const defaultEnd = new Date(defaultStart.getTime() + 60 * 60 * 1000);

  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [link, setLink] = useState(event?.link ?? "");
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
  const [editScope, setEditScope] = useState<"single" | "series" | null>(null);
  const [reminderChoice, setReminderChoice] = useState<string>(() => {
    if (event?.reminderDisabled) return "none";
    if (event?.reminderMinutes === null || event?.reminderMinutes === undefined) return "default";
    return String(event.reminderMinutes);
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const parseResponseBody = async (res: Response) => {
    const text = await res.text();
    if (!text) return { json: null as unknown, text: "" };
    try {
      return { json: JSON.parse(text) as unknown, text };
    } catch {
      return { json: null as unknown, text };
    }
  };

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

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
    if (canChooseRecurringEditScope && !editScope) {
      setError("Please choose whether to edit this event or the entire series.");
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
        link: link.trim() || null,
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
        ...(canChooseRecurringEditScope && editScope && {
          editScope,
          instanceStartTime: event?.instanceStartTime ?? event?.startTime,
        }),
      };

      const url = isEditing
        ? `/api/events/${event.originalId}`
        : "/api/events";
      const method = isEditing ? "PUT" : "POST";

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
        link: (saved.link ?? payload.link) as string | null,
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

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div className="min-h-full flex w-full items-center justify-center p-4">
        <div
          className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[min(90dvh,calc(100vh-2rem))] overflow-y-auto border border-gray-100 dark:border-gray-700"
          onClick={(e) => e.stopPropagation()}
        >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {isEditing ? "Edit event" : "New event"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 flex flex-col gap-4">
          {/* Title */}
          <div>
            <input
              ref={titleInputRef}
              type="text"
              placeholder="Add title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border-b-2 border-gray-200 dark:border-gray-700 focus:border-blue-500 outline-none text-lg font-medium py-1 placeholder-gray-400 dark:placeholder-gray-600 bg-transparent text-gray-900 dark:text-gray-100 transition-colors"
            />
          </div>

          {/* Start / End times */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <label
                htmlFor={startTimeInputId}
                className="text-xs font-medium text-gray-500 dark:text-gray-400 w-12"
              >
                Start
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 md:hidden"
              />
              <DesktopDateTimeInput
                id={startTimeInputId}
                value={startTime}
                onChange={setStartTime}
              />
            </div>
            <div className="flex items-center gap-3">
              <label
                htmlFor={endTimeInputId}
                className="text-xs font-medium text-gray-500 dark:text-gray-400 w-12"
              >
                End
              </label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 md:hidden"
              />
              <DesktopDateTimeInput
                id={endTimeInputId}
                value={endTime}
                onChange={setEndTime}
              />
            </div>
          </div>

          {/* Description */}
          <textarea
            placeholder="Add description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />

          {/* Link */}
          <div className="relative">
            <Link className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              inputMode="url"
              placeholder="Meeting link (optional)"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg py-2 pl-9 pr-3 text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Color */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Color</p>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          {/* Recurrence */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Repeat</p>
            <RecurrenceSelector
              value={recurrenceRule}
              onChange={setRecurrenceRule}
            />
            {recurrenceRule && (
              <div className="mt-2 flex items-center gap-2">
                <label
                  htmlFor={recurrenceEndDateInputId}
                  className="text-xs text-gray-500 dark:text-gray-400 shrink-0"
                >
                  End repeat on
                </label>
                <input
                  id={recurrenceEndDateInputId}
                  type="date"
                  value={recurrenceEndDate}
                  onChange={(e) => setRecurrenceEndDate(e.target.value)}
                  className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          {/* Recurring edit scope */}
          {canChooseRecurringEditScope && (
            <div className="space-y-2">
              <fieldset className="space-y-1.5">
                <legend className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Apply changes to
                </legend>
                <label
                  htmlFor={editScopeSingleId}
                  className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/80 cursor-pointer"
                >
                  <input
                    id={editScopeSingleId}
                    type="radio"
                    name={editScopeName}
                    checked={editScope === "single"}
                    onChange={() => {
                      setEditScope("single");
                      setError("");
                    }}
                    className="h-4 w-4 rounded-full border-2 border-gray-400 dark:border-gray-500 appearance-none checked:bg-blue-500 checked:border-blue-500"
                  />
                  <span>This event only</span>
                </label>
                <label
                  htmlFor={editScopeSeriesId}
                  className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/80 cursor-pointer"
                >
                  <input
                    id={editScopeSeriesId}
                    type="radio"
                    name={editScopeName}
                    checked={editScope === "series"}
                    onChange={() => {
                      setEditScope("series");
                      setError("");
                    }}
                    className="h-4 w-4 rounded-full border-2 border-gray-400 dark:border-gray-500 appearance-none checked:bg-blue-500 checked:border-blue-500"
                  />
                  <span>All events in the series</span>
                </label>
              </fieldset>
            </div>
          )}

          {/* Reminder */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Reminder
            </p>
            <select
              value={reminderChoice}
              onChange={(e) => setReminderChoice(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-60"
            >
              {saving ? "Saving…" : isEditing ? "Save changes" : "Create event"}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
