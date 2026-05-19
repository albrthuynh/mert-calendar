"use client";

import { Trash2, X } from "lucide-react";

interface RecurringEventDeleteModalProps {
  eventTitle: string;
  onClose: () => void;
  onChooseThisOnly: () => void | Promise<void>;
  onChooseAll: () => void | Promise<void>;
  busy?: boolean;
  error?: string | null;
}

export function RecurringEventDeleteModal({
  eventTitle,
  onClose,
  onChooseThisOnly,
  onChooseAll,
  busy = false,
  error,
}: RecurringEventDeleteModalProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="w-full max-w-md mx-4 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-900/25 dark:text-red-300">
              <Trash2 className="h-4 w-4" />
            </span>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Delete recurring event
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="px-6 text-sm text-gray-600 dark:text-gray-400">
          <span className="font-medium text-gray-800 dark:text-gray-200">{eventTitle}</span>{" "}
          is part of a repeating series. What would you like to delete?
        </p>
        {error && (
          <p className="px-6 pt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <div className="flex flex-col gap-2 px-6 pb-6 pt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onChooseThisOnly()}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-left text-sm transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-800/80"
          >
            <span className="font-medium text-gray-900 dark:text-gray-100">
              This event only
            </span>
            <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
              Delete just this occurrence and keep the rest of the series.
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onChooseAll()}
            className="w-full rounded-xl border border-red-200 px-4 py-3 text-left text-sm transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:hover:bg-red-900/20"
          >
            <span className="font-medium text-red-700 dark:text-red-300">
              All events in the series
            </span>
            <span className="mt-0.5 block text-xs text-red-500/90 dark:text-red-300/80">
              Delete every occurrence in this repeating series.
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="mt-1 self-end text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
