"use client";

import { useEffect, useRef, useState } from "react";

interface DesktopDateTimeInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}

type Segment = "hour" | "minute" | "period";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseLocalDateTime(value: string) {
  const [date = "", time = "00:00"] = value.split("T");
  const [hourText = "0", minuteText = "0"] = time.split(":");
  const hour24 = clamp(Number(hourText) || 0, 0, 23);
  const minute = clamp(Number(minuteText) || 0, 0, 59);
  const period: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  return { date, hour24, hour12, minute, period };
}

function composeLocalDateTime(
  date: string,
  hour12: number,
  minute: number,
  period: "AM" | "PM"
): string {
  let hour24 = clamp(hour12, 1, 12) % 12;
  if (period === "PM") hour24 += 12;
  return `${date}T${pad(hour24)}:${pad(clamp(minute, 0, 59))}`;
}

export function DesktopDateTimeInput({
  id,
  value,
  onChange,
}: DesktopDateTimeInputProps) {
  const parsed = parseLocalDateTime(value);
  const [draftHour, setDraftHour] = useState<string | null>(null);
  const [draftMinute, setDraftMinute] = useState<string | null>(null);

  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);
  const periodRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (document.activeElement !== hourRef.current) {
      setDraftHour(null);
    }
    if (document.activeElement !== minuteRef.current) {
      setDraftMinute(null);
    }
  }, [value]);

  const commitHour = (raw: string) => {
    const nextHour = clamp(Number(raw) || parsed.hour12, 1, 12);
    onChange(
      composeLocalDateTime(parsed.date, nextHour, parsed.minute, parsed.period)
    );
  };

  const commitMinute = (raw: string) => {
    const nextMinute = clamp(Number(raw) || 0, 0, 59);
    onChange(
      composeLocalDateTime(parsed.date, parsed.hour12, nextMinute, parsed.period)
    );
  };

  const focusSegment = (segment: Segment) => {
    requestAnimationFrame(() => {
      if (segment === "hour") {
        hourRef.current?.focus();
        hourRef.current?.select();
      } else if (segment === "minute") {
        minuteRef.current?.focus();
        minuteRef.current?.select();
      } else {
        periodRef.current?.focus();
      }
    });
  };

  const stepTime = (segment: "hour" | "minute", direction: 1 | -1) => {
    if (segment === "hour") {
      const nextHour = parsed.hour12 + direction;
      const wrapped = nextHour > 12 ? 1 : nextHour < 1 ? 12 : nextHour;
      onChange(
        composeLocalDateTime(parsed.date, wrapped, parsed.minute, parsed.period)
      );
      return;
    }

    const nextMinute = parsed.minute + direction;
    onChange(
      composeLocalDateTime(
        parsed.date,
        parsed.hour12,
        nextMinute > 59 ? 0 : nextMinute < 0 ? 59 : nextMinute,
        parsed.period
      )
    );
  };

  const handleSegmentKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    segment: "hour" | "minute"
  ) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      stepTime(segment, event.key === "ArrowUp" ? 1 : -1);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusSegment(segment === "hour" ? "hour" : "hour");
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusSegment(segment === "hour" ? "minute" : "period");
      return;
    }

    if (event.key === "Backspace" && segment === "minute") {
      const draft = draftMinute ?? "";
      if (draft.length === 0) {
        event.preventDefault();
        focusSegment("hour");
      }
    }
  };

  const handlePeriodKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const lowerKey = event.key.toLowerCase();

    if (lowerKey === "a" || lowerKey === "p") {
      event.preventDefault();
      onChange(
        composeLocalDateTime(
          parsed.date,
          parsed.hour12,
          parsed.minute,
          lowerKey === "a" ? "AM" : "PM"
        )
      );
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      focusSegment("minute");
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusSegment("minute");
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === " ") {
      event.preventDefault();
      onChange(
        composeLocalDateTime(
          parsed.date,
          parsed.hour12,
          parsed.minute,
          parsed.period === "AM" ? "PM" : "AM"
        )
      );
    }
  };

  const segmentClass =
    "h-9 rounded-md border border-transparent bg-transparent px-1 text-center text-sm font-semibold tabular-nums text-gray-800 outline-none transition-colors focus:border-blue-400 focus:bg-blue-50 focus:ring-2 focus:ring-blue-200 dark:text-gray-100 dark:focus:border-blue-500 dark:focus:bg-blue-950/40 dark:focus:ring-blue-900";

  return (
    <div className="hidden flex-1 items-center gap-2 md:flex">
      <input
        id={id}
        type="date"
        value={parsed.date}
        onChange={(event) =>
          onChange(
            composeLocalDateTime(
              event.target.value,
              parsed.hour12,
              parsed.minute,
              parsed.period
            )
          )
        }
        className="h-9 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2.5 text-sm text-gray-700 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:focus:ring-blue-900"
      />
      <div className="flex h-9 shrink-0 items-center rounded-lg border border-gray-300 bg-white px-1 dark:border-gray-600 dark:bg-gray-800">
        <input
          ref={hourRef}
          inputMode="numeric"
          aria-label="Hour"
          value={draftHour ?? pad(parsed.hour12)}
          onFocus={(event) => {
            setDraftHour("");
            event.currentTarget.select();
          }}
          onBlur={() => {
            if (draftHour !== null) commitHour(draftHour);
            setDraftHour(null);
          }}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "").slice(-2);
            if (!digits) {
              setDraftHour("");
              return;
            }
            const displayValue =
              digits.length === 1 ? pad(Number(digits)) : pad(clamp(Number(digits), 1, 12));
            setDraftHour(displayValue);
            commitHour(displayValue);
            if (digits.length >= 2) {
              focusSegment("minute");
            } else if (Number(digits) > 1) {
              focusSegment("minute");
            }
          }}
          onKeyDown={(event) => handleSegmentKeyDown(event, "hour")}
          className={`${segmentClass} w-8`}
        />
        <span className="text-sm font-semibold text-gray-400 dark:text-gray-500">
          :
        </span>
        <input
          ref={minuteRef}
          inputMode="numeric"
          aria-label="Minute"
          value={draftMinute ?? pad(parsed.minute)}
          onFocus={(event) => {
            setDraftMinute("");
            event.currentTarget.select();
          }}
          onBlur={() => {
            if (draftMinute !== null) commitMinute(draftMinute);
            setDraftMinute(null);
          }}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "").slice(-2);
            if (!digits) {
              setDraftMinute("");
              return;
            }
            const displayValue =
              digits.length === 1 ? pad(Number(digits)) : pad(clamp(Number(digits), 0, 59));
            setDraftMinute(displayValue);
            commitMinute(displayValue);
            if (digits.length >= 2) {
              focusSegment("period");
            } else if (Number(digits) > 5) {
              focusSegment("period");
            }
          }}
          onKeyDown={(event) => handleSegmentKeyDown(event, "minute")}
          className={`${segmentClass} w-8`}
        />
        <button
          ref={periodRef}
          type="button"
          onClick={() =>
            onChange(
              composeLocalDateTime(
                parsed.date,
                parsed.hour12,
                parsed.minute,
                parsed.period === "AM" ? "PM" : "AM"
              )
            )
          }
          onKeyDown={handlePeriodKeyDown}
          className="ml-1 h-7 rounded-md px-2 text-xs font-semibold text-gray-600 outline-none transition-colors hover:bg-gray-100 focus:bg-blue-50 focus:text-blue-700 focus:ring-2 focus:ring-blue-200 dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:bg-blue-950/40 dark:focus:text-blue-300 dark:focus:ring-blue-900"
        >
          {parsed.period}
        </button>
      </div>
    </div>
  );
}
