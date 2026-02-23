"use client";

import { RECURRENCE_OPTIONS } from "@/types/calendar";

interface RecurrenceSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export function RecurrenceSelector({ value, onChange }: RecurrenceSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    >
      {RECURRENCE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
