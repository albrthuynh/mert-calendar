import { CalendarEvent } from "@/types/calendar";
import { differenceInCalendarDays } from "date-fns";
import { validateEventSchedule } from "@/lib/recurringEvents";

export interface EventCopyPayload {
  title: string;
  description: string | null;
  link: string | null;
  startTime: string;
  endTime: string;
  color: string;
  allDay: boolean;
  recurrenceRule: string | null;
  recurrenceEndDate: string | null;
  timeZone: string;
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
  if (Number.isNaN(targetDay.getTime())) throw new Error("Choose a valid copy date.");
  if (!Number.isFinite(originalStart.getTime()) || !Number.isFinite(originalEnd.getTime()) || originalEnd <= originalStart) {
    throw new Error("The original event has an invalid start or end time.");
  }

  const copiedStart = new Date(targetDay);
  copiedStart.setHours(
    originalStart.getHours(),
    originalStart.getMinutes(),
    originalStart.getSeconds(),
    originalStart.getMilliseconds()
  );

  const copiedEnd = new Date(copiedStart);
  copiedEnd.setDate(copiedEnd.getDate() + differenceInCalendarDays(originalEnd, originalStart));
  copiedEnd.setHours(originalEnd.getHours(), originalEnd.getMinutes(), originalEnd.getSeconds(), originalEnd.getMilliseconds());

  if (event.allDay) {
    copiedStart.setTime(Date.UTC(targetDay.getFullYear(), targetDay.getMonth(), targetDay.getDate()));
    const originalDayCount = (Date.UTC(originalEnd.getUTCFullYear(), originalEnd.getUTCMonth(), originalEnd.getUTCDate()) -
      Date.UTC(originalStart.getUTCFullYear(), originalStart.getUTCMonth(), originalStart.getUTCDate())) / 86400000;
    copiedEnd.setTime(copiedStart.getTime() + originalDayCount * 86400000);
  }

  const payload: EventCopyPayload = {
    title: event.title,
    description: event.description,
    link: event.link,
    startTime: copiedStart.toISOString(),
    endTime: copiedEnd.toISOString(),
    color: event.color,
    allDay: event.allDay,
    recurrenceRule: event.recurrenceRule,
    recurrenceEndDate: event.recurrenceEndDate,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    reminderMinutes: event.reminderMinutes,
    reminderDisabled: event.reminderDisabled,
  };
  validateEventSchedule({
    ...payload, startTime: copiedStart, endTime: copiedEnd,
    recurrenceEndDate: payload.recurrenceEndDate ? new Date(payload.recurrenceEndDate) : null,
  }, payload.timeZone);
  return payload;
}
