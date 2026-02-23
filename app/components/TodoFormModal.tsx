"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { X } from "lucide-react";
import { Todo } from "@/types/calendar";

interface TodoFormModalProps {
  initialDate: Date;
  todo?: Todo;
  onClose: () => void;
  onSave: (todo: Todo) => void;
}

function toDateValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function TodoFormModal({
  initialDate,
  todo,
  onClose,
  onSave,
}: TodoFormModalProps) {
  const isEditing = !!todo;

  const existingDueDate = todo?.dueDate ? new Date(todo.dueDate) : null;

  const [title, setTitle] = useState(todo?.title ?? "");
  const [description, setDescription] = useState(todo?.description ?? "");
  const [taskDate, setTaskDate] = useState(
    toDateValue(todo ? new Date(todo.taskDate) : initialDate)
  );
  const [hasDueTime, setHasDueTime] = useState(!!existingDueDate);
  const [dueTime, setDueTime] = useState(
    existingDueDate
      ? toTimeValue(existingDueDate)
      : toTimeValue(new Date(initialDate.getTime() + 60 * 60 * 1000))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

    setSaving(true);
    setError("");

    try {
      // Parse as local time — new Date("YYYY-MM-DD") parses as UTC which shifts the day
      const [yr, mo, dy] = taskDate.split("-").map(Number);
      const taskDateObj = new Date(yr, mo - 1, dy, 0, 0, 0, 0);
      let dueDateIso: string | null = null;
      if (hasDueTime) {
        const [hours, minutes] = dueTime.split(":").map(Number);
        const d = new Date(taskDateObj);
        d.setHours(hours, minutes, 0, 0);
        dueDateIso = d.toISOString();
      }

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        taskDate: taskDateObj.toISOString(),
        dueDate: dueDateIso,
      };

      const url = isEditing ? `/api/todos/${todo.id}` : "/api/todos";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        let message = "Failed to save";
        try { message = JSON.parse(text).error ?? message; } catch { /* use default */ }
        throw new Error(message);
      }

      const saved = await res.json();
      onSave({
        id: saved.id,
        title: saved.title,
        description: saved.description,
        taskDate: saved.taskDate ?? payload.taskDate,
        dueDate: saved.dueDate ?? null,
        completed: saved.completed ?? false,
        order: saved.order ?? 0,
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
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {isEditing ? "Edit to-do" : "New to-do"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 flex flex-col gap-4">
          <input
            autoFocus
            type="text"
            placeholder="What needs to be done?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border-b-2 border-gray-200 dark:border-gray-700 focus:border-blue-500 outline-none text-lg font-medium py-1 placeholder-gray-400 dark:placeholder-gray-600 bg-transparent text-gray-900 dark:text-gray-100 transition-colors"
          />

          {/* Date (always required) */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 w-14 shrink-0">
              Date
            </label>
            <input
              type="date"
              value={taskDate}
              onChange={(e) => setTaskDate(e.target.value)}
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Optional due time */}
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasDueTime}
                onChange={(e) => setHasDueTime(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-blue-500"
              />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Set a due time
              </span>
            </label>
            {hasDueTime && (
              <div className="flex items-center gap-3">
                <div className="w-14 shrink-0" />
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          <textarea
            placeholder="Notes (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

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
              {saving ? "Saving…" : isEditing ? "Save changes" : "Add to-do"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
