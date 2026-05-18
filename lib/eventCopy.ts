import { CalendarEvent } from "@/types/calendar";

export interface EventCopyPayload {
  title: string;
  description: string | null;
  link: string | null;
  startTime: string;
  endTime: string;
  color: string;
  allDay: boolean;
  recurrenceRule: null;
  recurrenceEndDate: null;
  reminderMinutes: number | null;
  reminderDisabled: boolean;
}

export function parseDateInputValue(value: string): Date | null {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function buildEventCopyPayload(
  event: CalendarEvent,
  targetDay: Date
): EventCopyPayload {
  const originalStart = new Date(event.startTime);
  const originalEnd = new Date(event.endTime);
  const durationMs = Math.max(
    0,
    originalEnd.getTime() - originalStart.getTime()
  );

  const copiedStart = new Date(targetDay);
  copiedStart.setHours(
    originalStart.getHours(),
    originalStart.getMinutes(),
    originalStart.getSeconds(),
    originalStart.getMilliseconds()
  );

  const copiedEnd = new Date(copiedStart.getTime() + durationMs);

  return {
    title: event.title,
    description: event.description,
    link: event.link,
    startTime: copiedStart.toISOString(),
    endTime: copiedEnd.toISOString(),
    color: event.color,
    allDay: event.allDay,
    recurrenceRule: null,
    recurrenceEndDate: null,
    reminderMinutes: event.reminderMinutes,
    reminderDisabled: event.reminderDisabled,
  };
}
