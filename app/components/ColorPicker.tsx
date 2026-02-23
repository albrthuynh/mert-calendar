"use client";

import { Check } from "lucide-react";
import { EVENT_COLORS } from "@/types/calendar";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {EVENT_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          title={c.label}
          onClick={() => onChange(c.value)}
          className="w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400"
          style={{ backgroundColor: c.value }}
        >
          {value === c.value && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}
