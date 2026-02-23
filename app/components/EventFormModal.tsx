"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { X } from "lucide-react";
import { CalendarEvent } from "@/types/calendar";
import { ColorPicker } from "./ColorPicker";
import { RecurrenceSelector } from "./RecurrenceSelector";

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Close on Escape
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

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save event");
      }

      const saved = await res.json();
      onSave({
        ...saved,
        startTime: saved.startTime ?? payload.startTime,
        endTime: saved.endTime ?? payload.endTime,
        recurrenceEndDate: saved.recurrenceEndDate ?? payload.recurrenceEndDate,
        isRecurringInstance: false,
        originalId: saved.id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h2 className="text-base font-semibold text-gray-900">
            {isEditing ? "Edit event" : "New event"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 flex flex-col gap-4">
          {/* Title */}
          <div>
            <input
              autoFocus
              type="text"
              placeholder="Add title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border-b-2 border-gray-200 focus:border-blue-500 outline-none text-lg font-medium py-1 placeholder-gray-400 transition-colors"
            />
          </div>

          {/* Start / End times */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-500 w-12">
                Start
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-500 w-12">
                End
              </label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Description */}
          <textarea
            placeholder="Add description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />

          {/* Color */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Color</p>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          {/* Recurrence */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">Repeat</p>
            <RecurrenceSelector
              value={recurrenceRule}
              onChange={setRecurrenceRule}
            />
            {recurrenceRule && (
              <div className="mt-2 flex items-center gap-2">
                <label className="text-xs text-gray-500 shrink-0">
                  End repeat on
                </label>
                <input
                  type="date"
                  value={recurrenceEndDate}
                  onChange={(e) => setRecurrenceEndDate(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
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
  );
}
