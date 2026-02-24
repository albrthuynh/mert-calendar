import { HOUR_HEIGHT } from "@/lib/calendarConstants";

const MS_PER_MINUTE = 60 * 1000;

/** Snap a date to the nearest step-minute boundary (e.g. 30 for :00 and :30). */
export function snapToMinutes(date: Date, step: number): Date {
  const d = new Date(date);
  const minutes = d.getMinutes() + d.getHours() * 60;
  const snapped = Math.round(minutes / step) * step;
  d.setHours(Math.floor(snapped / 60), snapped % 60, 0, 0);
  return d;
}

/** Convert vertical pixels (in the time grid) to minutes. */
export function pixelsToMinutes(pixels: number): number {
  return (pixels / HOUR_HEIGHT) * 60;
}

/** Convert minutes to vertical pixels in the time grid. */
export function minutesToPixels(minutes: number): number {
  return (minutes / 60) * HOUR_HEIGHT;
}

/** Given a day and Y offset from top of the day column (in pixels), return the time as a Date. */
export function pixelYToTime(day: Date, pixelY: number): Date {
  const minutes = pixelsToMinutes(pixelY);
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  d.setTime(d.getTime() + minutes * MS_PER_MINUTE);
  return d;
}
