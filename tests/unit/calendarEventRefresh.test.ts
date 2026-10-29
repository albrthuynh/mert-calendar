/** @jest-environment jsdom */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { useCalendarEventRefresh } from "@/app/hooks/useCalendarEventRefresh";
import { eventsVersionChanged, invalidateEventsCache } from "@/lib/calendarDataCache";

jest.mock("@/lib/calendarDataCache", () => ({
  eventsVersionChanged: jest.fn(),
  invalidateEventsCache: jest.fn(),
}));

function Calendar({ refresh }: { refresh: () => Promise<void> }) {
  useCalendarEventRefresh(refresh);
  return null;
}

describe("calendar background refresh", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let visibility: string;
  let refresh: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    visibility = "visible";
    jest.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility as DocumentVisibilityState);
    (eventsVersionChanged as jest.Mock).mockResolvedValue(false);
    refresh = jest.fn().mockResolvedValue(undefined);
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  async function mount() {
    await act(async () => root.render(createElement(Calendar, { refresh })));
  }

  it("checks once a minute, then stops when unattended and resumes on activity", async () => {
    await mount();
    expect(eventsVersionChanged).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTime(60_000));
    expect(eventsVersionChanged).toHaveBeenCalledTimes(2);
    await act(async () => jest.advanceTimersByTime(600_000));
    expect(eventsVersionChanged).toHaveBeenCalledTimes(2);
    await act(async () => window.dispatchEvent(new Event("pointerdown")));
    expect(eventsVersionChanged).toHaveBeenCalledTimes(3);
    await act(async () => window.dispatchEvent(new Event("keydown")));
    expect(eventsVersionChanged).toHaveBeenCalledTimes(3);
  });

  it("does not query in a hidden tab and checks when it becomes visible", async () => {
    visibility = "hidden";
    await mount();
    await act(async () => jest.advanceTimersByTime(600_000));
    expect(eventsVersionChanged).not.toHaveBeenCalled();
    visibility = "visible";
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(eventsVersionChanged).toHaveBeenCalledTimes(1);
  });

  it("refreshes changed events and handles local updates even while idle", async () => {
    (eventsVersionChanged as jest.Mock).mockResolvedValueOnce(true);
    await mount();
    expect(invalidateEventsCache).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith({ force: true });
    await act(async () => jest.advanceTimersByTime(600_000));
    await act(async () => window.dispatchEvent(new Event("mert-calendar:events-updated")));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does not overlap slow checks or refresh after unmount", async () => {
    let resolveCheck!: (changed: boolean) => void;
    (eventsVersionChanged as jest.Mock).mockReturnValue(new Promise<boolean>((resolve) => { resolveCheck = resolve; }));
    await mount();
    await act(async () => jest.advanceTimersByTime(60_000));
    expect(eventsVersionChanged).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => resolveCheck(true));
    expect(refresh).not.toHaveBeenCalled();
  });
});
