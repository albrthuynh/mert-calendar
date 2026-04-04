"use client";

import { X } from "lucide-react";

interface RecurringEventMoveModalProps {
  eventTitle: string;
  onClose: () => void;
  onChooseThisOnly: () => void | Promise<void>;
  onChooseAll: () => void | Promise<void>;
  busy?: boolean;
  error?: string | null;
}

export function RecurringEventMoveModal({
  eventTitle,
  onClose,
  onChooseThisOnly,
  onChooseAll,
  busy = false,
  error,
}: RecurringEventMoveModalProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Move recurring event
          </h2>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="px-6 text-sm text-gray-600 dark:text-gray-400">
          <span className="font-medium text-gray-800 dark:text-gray-200">{eventTitle}</span>{" "}
          is part of a repeating series. What would you like to move?
        </p>
        {error && (
          <p className="px-6 pt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <div className="px-6 pb-6 pt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onChooseThisOnly()}
            className="w-full text-left rounded-xl border border-gray-200 dark:border-gray-600 px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-colors disabled:opacity-50"
          >
            <span className="font-medium text-gray-900 dark:text-gray-100">
              This event only
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Move just this occurrence to the new time.
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onChooseAll()}
            className="w-full text-left rounded-xl border border-gray-200 dark:border-gray-600 px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-colors disabled:opacity-50"
          >
            <span className="font-medium text-gray-900 dark:text-gray-100">
              All events in the series
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Shift the entire series by the same amount of time.
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="mt-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 self-end"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
