import { buildEventsUrl } from "@/lib/eventFetchUrl";
import type { CalendarEvent, ImportantDay, Todo } from "@/types/calendar";

const CALENDAR_DATA_CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry<T> = {
  data?: T;
  expiresAt: number;
  inFlight?: Promise<T>;
};

type FetchOptions = {
  force?: boolean;
};

type EventsVersionResponse = {
  version: string;
};

const cache = new Map<string, CacheEntry<unknown>>();
let knownEventsVersion: string | null = null;
let eventsVersionInFlight: Promise<string> | null = null;

function cacheKey(scope: string, parts: string[]) {
  return [scope, ...parts].join(":");
}

async function fetchJson<T>(
  key: string,
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;

  if (!options.force && existing?.data !== undefined && existing.expiresAt > now) {
    return existing.data;
  }

  if (existing?.inFlight) {
    return existing.inFlight;
  }

  const request = fetch(url)
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      return (await res.json()) as T;
    })
    .then((data) => {
      cache.set(key, {
        data,
        expiresAt: Date.now() + CALENDAR_DATA_CACHE_TTL_MS,
      });
      return data;
    })
    .finally(() => {
      const current = cache.get(key);
      if (current?.inFlight === request) {
        current.inFlight = undefined;
      }
    });

  cache.set(key, {
    data: existing?.data,
    expiresAt: existing?.expiresAt ?? 0,
    inFlight: request,
  });

  return request;
}

function invalidateScope(scope: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(`${scope}:`)) {
      cache.delete(key);
    }
  }
}

export function invalidateEventsCache() {
  invalidateScope("events");
}

export function invalidateTodosCache() {
  invalidateScope("todos");
}

export function invalidateImportantDaysCache() {
  invalidateScope("importantDays");
}

export function invalidateCalendarDataCache() {
  cache.clear();
  knownEventsVersion = null;
}

export function fetchEventsForRange(
  start: string,
  end: string,
  options?: FetchOptions
) {
  return fetchJson<CalendarEvent[]>(
    cacheKey("events", [start, end, buildEventsUrl(start, end)]),
    buildEventsUrl(start, end),
    options
  );
}

export function fetchTodosForRange(
  start: string,
  end: string,
  options?: FetchOptions
) {
  return fetchJson<Todo[]>(
    cacheKey("todos", [start, end]),
    `/api/todos?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    options
  );
}

export function fetchImportantDaysForRange(
  startKey: string,
  endKey: string,
  options?: FetchOptions
) {
  return fetchJson<ImportantDay[]>(
    cacheKey("importantDays", [startKey, endKey]),
    `/api/important-days?startKey=${encodeURIComponent(startKey)}&endKey=${encodeURIComponent(endKey)}`,
    options
  );
}

export async function eventsVersionChanged() {
  if (!eventsVersionInFlight) {
    eventsVersionInFlight = fetch("/api/events/version")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }
        const body = (await res.json()) as EventsVersionResponse;
        return body.version;
      })
      .finally(() => {
        eventsVersionInFlight = null;
      });
  }

  const version = await eventsVersionInFlight;
  if (knownEventsVersion === null) {
    knownEventsVersion = version;
    return false;
  }

  if (knownEventsVersion !== version) {
    knownEventsVersion = version;
    return true;
  }

  return false;
}
