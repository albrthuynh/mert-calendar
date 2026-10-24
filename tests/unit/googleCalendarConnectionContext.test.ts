/** @jest-environment jsdom */

import { act, createElement, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GoogleCalendarConnectionProvider, useGoogleCalendarConnection } from "@/app/context/GoogleCalendarConnectionContext";
import { EventDetailPopover } from "@/app/components/EventDetailPopover";
import type { CalendarEvent } from "@/types/calendar";
import type { GoogleCalendarStatus } from "@/lib/googleCalendar";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const connectedStatus: GoogleCalendarStatus = {
  connected: true, enabled: true, requiresReconnect: false, connectionError: null,
  hasCalendarScope: true, hasCalendarListScope: true, lastSyncedAt: null,
  webhookConfigured: true, watchActive: true, watchExpiresAt: null,
};
const event: CalendarEvent = {
  id: "event-1", originalId: "event-1", title: "Meeting", description: null, link: null,
  startTime: "2026-10-23T19:00:00.000Z", endTime: "2026-10-23T20:00:00.000Z",
  color: "#4285F4", allDay: false, recurrenceRule: null, recurrenceEndDate: null,
  reminderMinutes: null, reminderDisabled: false, isRecurringInstance: false,
};

function ConnectionHarness() {
  const { canInviteGuests, status, refreshStatus, markReconnectRequired } = useGoogleCalendarConnection();
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  return createElement("div", null,
    createElement("output", { "data-testid": "access" }, String(canInviteGuests)),
    createElement("output", { "data-testid": "reconnect" }, String(status?.requiresReconnect ?? false)),
    createElement("button", { onClick: () => setSelectedEvent(event) }, "Open first event"),
    createElement("button", { onClick: () => setSelectedEvent({ ...event, id: "event-2", originalId: "event-2", title: "Second meeting" }) }, "Open second event"),
    createElement("button", { onClick: () => { void refreshStatus().catch(() => {}); } }, "Refresh connection"),
    createElement("button", { onClick: markReconnectRequired }, "Require reconnect"),
    selectedEvent && createElement(EventDetailPopover, {
      event: selectedEvent, anchorRect: { top: 100, left: 100, right: 200 } as DOMRect,
      onClose: () => setSelectedEvent(null), onEdit: jest.fn(), onDelete: jest.fn(),
    })
  );
}

describe("shared Google Calendar connection", () => {
  let root: Root;
  let container: HTMLDivElement;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    globalThis.fetch = jest.fn();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    globalThis.fetch = originalFetch;
  });

  async function renderConnection(initialStatus: GoogleCalendarStatus | null = null, child: ReactNode = createElement(ConnectionHarness)) {
    await act(async () => root.render(createElement(GoogleCalendarConnectionProvider, { initialStatus }, child)));
  }

  function button(label: string) {
    return Array.from(document.querySelectorAll("button")).find((control) => control.textContent === label)!;
  }

  it("shows invitations immediately from page status, with no per-event status requests", async () => {
    let resolveStatus!: (response: unknown) => void;
    (globalThis.fetch as jest.Mock).mockReturnValue(new Promise((resolve) => { resolveStatus = resolve; }));
    await renderConnection(connectedStatus);
    act(() => button("Open first event").click());
    expect(button("Invite guests")).toBeDefined();
    act(() => button("Open second event").click());
    expect(button("Invite guests")).toBeDefined();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    await act(async () => resolveStatus({ ok: true, json: async () => connectedStatus }));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("reuses the first authorization result when no server status was available", async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => connectedStatus });
    await renderConnection();
    act(() => button("Open first event").click());
    expect(button("Invite guests")).toBeDefined();
    act(() => button("Open second event").click());
    expect(button("Invite guests")).toBeDefined();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("deduplicates simultaneous refreshes", async () => {
    let resolveStatus!: (response: unknown) => void;
    (globalThis.fetch as jest.Mock).mockReturnValue(new Promise((resolve) => { resolveStatus = resolve; }));
    await renderConnection();
    act(() => {
      button("Refresh connection").click();
      button("Refresh connection").click();
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    await act(async () => resolveStatus({ ok: true, json: async () => connectedStatus }));
    expect(container.querySelector('[data-testid="access"]')?.textContent).toBe("true");
  });

  it("updates existing and future popups after a refresh and reconnect", async () => {
    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => connectedStatus })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...connectedStatus, requiresReconnect: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => connectedStatus });
    await renderConnection(connectedStatus);
    act(() => button("Open first event").click());
    await act(async () => button("Refresh connection").click());
    expect(button("Invite guests")).toBeUndefined();
    act(() => button("Open second event").click());
    expect(button("Invite guests")).toBeUndefined();
    await act(async () => button("Refresh connection").click());
    expect(button("Invite guests")).toBeDefined();
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it("does not restore revoked access from an older in-flight response", async () => {
    let resolveStatus!: (response: unknown) => void;
    (globalThis.fetch as jest.Mock).mockReturnValue(new Promise((resolve) => { resolveStatus = resolve; }));
    await renderConnection(connectedStatus);
    act(() => button("Require reconnect").click());
    await act(async () => resolveStatus({ ok: true, json: async () => connectedStatus }));
    expect(container.querySelector('[data-testid="access"]')?.textContent).toBe("false");
    expect(container.querySelector('[data-testid="reconnect"]')?.textContent).toBe("true");
  });

  it("invalidates cached eligibility on guest authorization failure while keeping its error visible", async () => {
    (globalThis.fetch as jest.Mock).mockImplementation(async (url) => String(url).includes("/guests")
      ? { ok: false, status: 409, json: async () => ({ requiresReconnect: true, error: "Reconnect Google Calendar to invite guests." }) }
      : { ok: true, json: async () => connectedStatus });
    await renderConnection(connectedStatus);
    act(() => button("Open first event").click());
    await act(async () => button("Invite guests").click());
    expect(document.querySelector('[aria-modal="true"] [role="alert"]')?.textContent).toContain("Reconnect Google Calendar");
    expect(container.querySelector('[data-testid="access"]')?.textContent).toBe("false");
    expect(button("Invite guests")).toBeUndefined();
    expect((globalThis.fetch as jest.Mock).mock.calls.filter(([url]) => url === "/api/google-calendar/status")).toHaveLength(1);
  });

  it("clears access on sign-out and does not retain the previous page's status", async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) });
    await renderConnection(connectedStatus);
    expect(container.querySelector('[data-testid="access"]')?.textContent).toBe("false");
    (globalThis.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ ...connectedStatus, connected: false, enabled: false }) });
    await act(async () => root.render(createElement(GoogleCalendarConnectionProvider, {
      key: "different-account", initialStatus: null,
    }, createElement(ConnectionHarness))));
    expect(container.querySelector('[data-testid="access"]')?.textContent).toBe("false");
  });
});
