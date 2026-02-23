"use client";

import { useState } from "react";

interface CalendarAppearanceModalProps {
  initialBackgroundUrl: string | null;
  initialTopLeftUrl: string | null;
  onSave: (prefs: { backgroundUrl: string | null; topLeftUrl: string | null }) => Promise<void> | void;
  onClose: () => void;
}

export function CalendarAppearanceModal({
  initialBackgroundUrl,
  initialTopLeftUrl,
  onSave,
  onClose,
}: CalendarAppearanceModalProps) {
  const [backgroundUrl, setBackgroundUrl] = useState(initialBackgroundUrl ?? "");
  const [topLeftUrl, setTopLeftUrl] = useState(initialTopLeftUrl ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSave({
        backgroundUrl: backgroundUrl.trim() ? backgroundUrl.trim() : null,
        topLeftUrl: topLeftUrl.trim() ? topLeftUrl.trim() : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Calendar appearance
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Paste direct image URLs to customize your calendar background and header image. Leave
            fields empty to use the default appearance.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Background image URL
            </label>
            <input
              type="url"
              value={backgroundUrl}
              onChange={(e) => setBackgroundUrl(e.target.value)}
              placeholder="https://example.com/background.jpg"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 px-2.5 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Top-left header image URL
            </label>
            <input
              type="url"
              value={topLeftUrl}
              onChange={(e) => setTopLeftUrl(e.target.value)}
              placeholder="https://example.com/header.png"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 px-2.5 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

