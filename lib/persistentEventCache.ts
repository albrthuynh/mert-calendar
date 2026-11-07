import { buildEventsUrl } from "./eventFetchUrl";
import type { CalendarEvent } from "@/types/calendar";

const STORAGE_PREFIX = "mert-calendar:events:v1:";
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RANGES = 12;

type SavedRange = { url: string; savedAt: number; events: CalendarEvent[] };

function readRanges(userId: string): SavedRange[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_PREFIX + userId) ?? "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter((range): range is SavedRange =>
      range && typeof range.url === "string" &&
      typeof range.savedAt === "number" && range.savedAt <= Date.now() &&
      range.savedAt > Date.now() - RETENTION_MS && Array.isArray(range.events) &&
      range.events.every((event: CalendarEvent) => event &&
        typeof event.id === "string" && typeof event.title === "string" &&
        typeof event.startTime === "string" && typeof event.endTime === "string" &&
        Number.isFinite(Date.parse(event.startTime)) && Number.isFinite(Date.parse(event.endTime)))
    ).slice(-MAX_RANGES);
  } catch {
    return [];
  }
}

export function readSavedEvents(userId: string, start: string, end: string) {
  return readRanges(userId).find((range) => range.url === buildEventsUrl(start, end))?.events;
}

export function saveEvents(userId: string, start: string, end: string, events: CalendarEvent[]) {
  try {
    const url = buildEventsUrl(start, end);
    const ranges = readRanges(userId).filter((range) => range.url !== url);
    ranges.push({ url, savedAt: Date.now(), events });
    localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(ranges.slice(-MAX_RANGES)));
  } catch {
    // Storage may be disabled or full; network loading must still work.
  }
}

export function clearSavedEvents() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Private browsing can deny access to storage.
  }
}
