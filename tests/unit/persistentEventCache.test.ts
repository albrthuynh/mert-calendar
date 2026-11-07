/** @jest-environment jsdom */
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarCacheProvider } from "@/app/context/CalendarCacheContext";
import { useCalendarEvents } from "@/app/hooks/useCalendarEvents";
import { readSavedEvents, saveEvents } from "@/lib/persistentEventCache";
import { eventsVersionChanged, fetchEventsForRange, invalidateCalendarDataCache, invalidateEventsCache } from "@/lib/calendarDataCache";
import type { CalendarEvent } from "@/types/calendar";

const start = "2026-11-01T00:00:00.000Z";
const end = "2026-11-07T23:59:59.999Z";
const event: CalendarEvent = {
  id: "event-1", originalId: "event-1", title: "Saved meeting", description: null, link: null,
  startTime: "2026-11-03T12:00:00Z", endTime: "2026-11-03T13:00:00Z", color: "#4285F4",
  allDay: false, recurrenceRule: null, recurrenceEndDate: null, reminderMinutes: null,
  reminderDisabled: true, isRecurringInstance: false,
};

function Calendar({ rangeStart = start, rangeEnd = end }: { rangeStart?: string; rangeEnd?: string }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const { loading } = useCalendarEvents(rangeStart, rangeEnd, setEvents);
  return createElement("div", null, loading ? "Loading" : "Ready", ...events.map((item) => item.title));
}

describe("returning-user event loading", () => {
  let root: ReturnType<typeof createRoot>;
  let container: HTMLDivElement;
  let fetchMock: jest.Mock;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    invalidateCalendarDataCache();
    localStorage.clear();
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  async function render(userId = "user-1", rangeStart = start, rangeEnd = end) {
    await act(async () => root.render(createElement(CalendarCacheProvider, {
      userId,
    }, createElement(Calendar, { rangeStart, rangeEnd }))));
  }

  it("shows persisted events while the network is pending, then replaces them with fresh events", async () => {
    saveEvents("user-1", start, end, [event]);
    let finishFetch!: (response: unknown) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => { finishFetch = resolve; }));
    await render();
    expect(container.textContent).toBe("ReadySaved meeting");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => finishFetch({ ok: true, json: async () => [{ ...event, title: "Updated meeting" }] }));
    expect(container.textContent).toBe("ReadyUpdated meeting");
    expect(readSavedEvents("user-1", start, end)?.[0].title).toBe("Updated meeting");
  });

  it("keeps a saved schedule visible when offline", async () => {
    saveEvents("user-1", start, end, [event]);
    fetchMock.mockRejectedValue(new Error("Offline"));
    await render();
    expect(container.textContent).toBe("ReadySaved meeting");
  });

  it("isolates accounts and shows loading when no saved range exists", async () => {
    saveEvents("user-1", start, end, [event]);
    fetchMock.mockReturnValue(new Promise(() => {}));
    await render("user-2");
    expect(container.textContent).toBe("Loading");
    expect(readSavedEvents("user-2", start, end)).toBeUndefined();
    await render("user-1");
    expect(container.textContent).toBe("ReadySaved meeting");
    await render("user-2");
    expect(container.textContent).toBe("Loading");
  });

  it("ignores a slow response from the previous range", async () => {
    let finishOldFetch!: (response: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { finishOldFetch = resolve; }));
    await render();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [{ ...event, title: "Next week" }] });
    await render("user-1", "2026-11-08T00:00:00Z", "2026-11-14T23:59:59Z");
    await act(async () => finishOldFetch({ ok: true, json: async () => [event] }));
    expect(container.textContent).toBe("ReadyNext week");
  });

  it("does not repopulate invalidated snapshots from an older request", async () => {
    saveEvents("user-1", start, end, [event]);
    let finishFetch!: (response: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { finishFetch = resolve; }));
    const request = fetchEventsForRange(start, end, { userId: "user-1", force: true });
    invalidateEventsCache();
    finishFetch({ ok: true, json: async () => [event] });
    await request;
    expect(readSavedEvents("user-1", start, end)).toBeUndefined();
  });

  it("expires old snapshots, tolerates corrupt storage, and bounds stored ranges", () => {
    const now = Date.now();
    jest.spyOn(Date, "now").mockReturnValue(now - 8 * 24 * 60 * 60 * 1000);
    saveEvents("user-1", start, end, [event]);
    jest.spyOn(Date, "now").mockReturnValue(now);
    expect(readSavedEvents("user-1", start, end)).toBeUndefined();
    localStorage.setItem("mert-calendar:events:v1:user-1", "{invalid");
    expect(readSavedEvents("user-1", start, end)).toBeUndefined();
    for (let rangeIndex = 0; rangeIndex < 20; rangeIndex++) {
      saveEvents("user-1", String(rangeIndex), end, []);
    }
    expect(JSON.parse(localStorage.getItem("mert-calendar:events:v1:user-1")!)).toHaveLength(12);
    expect(readSavedEvents("user-1", "19", end)).toEqual([]);
  });

  it("refreshes after the first background sync, then only when its revision changes", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ version: "1" }) });
    expect(await eventsVersionChanged()).toBe(true);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ version: "1" }) });
    expect(await eventsVersionChanged()).toBe(false);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ version: "2" }) });
    expect(await eventsVersionChanged()).toBe(true);
  });

  it("still renders network results when browser storage is unavailable", async () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage disabled"); });
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage disabled"); });
    fetchMock.mockResolvedValue({ ok: true, json: async () => [event] });
    await render();
    expect(container.textContent).toBe("ReadySaved meeting");
  });
});
