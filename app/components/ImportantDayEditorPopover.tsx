"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { ImportantDay } from "@/types/calendar";

const LABEL_MAX = 120;

export type ImportantDaySavePayload =
  | { dateKey: string; remove: true }
  | { dateKey: string; remove: false; label: string };

interface ImportantDayEditorPopoverProps {
  day: Date;
  anchorRect: DOMRect;
  existing: ImportantDay | undefined;
  onClose: () => void;
  onSave: (payload: ImportantDaySavePayload) => Promise<void>;
}

export function ImportantDayEditorPopover({
  day,
  anchorRect,
  existing,
  onClose,
  onSave,
}: ImportantDayEditorPopoverProps) {
  const [label, setLabel] = useState(existing?.label ?? "");
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const dateKey = format(day, "yyyy-MM-dd");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    let onDoc: ((e: MouseEvent) => void) | undefined;
    let cancelled = false;
    const id = window.setTimeout(() => {
      if (cancelled) return;
      onDoc = (e: MouseEvent) => {
        const n = e.target as Node;
        if (panelRef.current?.contains(n)) return;
        onClose();
      };
      document.addEventListener("mousedown", onDoc);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
      document.removeEventListener("keydown", onKey);
      if (onDoc) document.removeEventListener("mousedown", onDoc);
    };
  }, [onClose]);

  const position = () => {
    const w = 280;
    const margin = 8;
    let left = anchorRect.left;
    if (left + w + margin > window.innerWidth) {
      left = Math.max(margin, window.innerWidth - w - margin);
    }
    let top = anchorRect.bottom + 6;
    const estH = 200;
    if (top + estH > window.innerHeight - margin) {
      top = Math.max(margin, anchorRect.top - estH - 6);
    }
    return { top, left, width: w };
  };

  const { top, left, width } = position();

  const handleRemove = async () => {
    setBusy(true);
    try {
      await onSave({ dateKey, remove: true });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const trimmedLabel = label.trim().slice(0, LABEL_MAX);
  const canSave = trimmedLabel.length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await onSave({
        dateKey,
        remove: false,
        label: trimmedLabel,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const node = (
    <div
      ref={panelRef}
      className="fixed z-[200] rounded-lg border border-blue-200/90 bg-white/95 shadow-xl shadow-blue-900/5 backdrop-blur-sm dark:border-blue-800/60 dark:bg-gray-900/95 dark:shadow-blue-950/20 p-3 text-left"
      style={{ top, left, width }}
      role="dialog"
      aria-labelledby="important-day-editor-title"
    >
      <h3
        id="important-day-editor-title"
        className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2"
      >
        {format(day, "EEEE, MMM d")}
      </h3>
      <label
        htmlFor="important-day-label"
        className="block text-xs font-medium text-blue-800/80 dark:text-blue-300/90 mb-1"
      >
        Label <span className="text-red-500">*</span>
      </label>
      <input
        id="important-day-label"
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value.slice(0, LABEL_MAX))}
        placeholder="e.g. CS 412 exam"
        required
        aria-required
        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/35 dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-blue-400 dark:focus:ring-blue-400/30"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (canSave) void handleSave();
          }
        }}
      />
      <div className="flex flex-wrap gap-2 mt-3 justify-end">
        {existing && (
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={busy}
            className="px-2.5 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-md transition-colors"
          >
            Remove
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-md transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={busy || !canSave}
          className="px-2.5 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 transition-colors disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}
