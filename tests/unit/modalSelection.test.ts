/** @jest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EventFormModal } from "@/app/components/EventFormModal";
import { TodoFormModal } from "@/app/components/TodoFormModal";
import { SettingsModal } from "@/app/components/SettingsModal";
import { GoogleCalendarConnectionProvider } from "@/app/context/GoogleCalendarConnectionContext";
import { signIn } from "next-auth/react";
import type { CalendarEvent } from "@/types/calendar";

jest.mock("next-auth/react", () => ({ signIn: jest.fn(), signOut: jest.fn() }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const connectedStatus = {
  connected: true,
  requiresReconnect: false,
  connectionError: null,
  enabled: true,
  hasCalendarScope: true,
  hasCalendarListScope: true,
  lastSyncedAt: null,
  webhookConfigured: true,
  watchActive: true,
  watchExpiresAt: null,
};

function settingsModal(onClose = jest.fn()) {
  return createElement(GoogleCalendarConnectionProvider, null, createElement(SettingsModal, {
    user: null,
    initialAppearance: { backgroundUrl: null, topLeftUrl: null },
    initialNotifications: {
      notificationsEnabled: false,
      defaultReminderMinutes: 10,
      notificationSoundEnabled: false,
      notificationSound: "beep",
      notificationVolume: 80,
    },
    onSaveAppearance: jest.fn(),
    onSaveNotifications: jest.fn(),
    onClose,
  }));
}

describe("dialog selection and Google reconnection", () => {
  let root: Root;
  let container: HTMLDivElement;
  let statusResponse: typeof connectedStatus;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    statusResponse = { ...connectedStatus };
    globalThis.fetch = jest.fn(async (url) => ({
      ok: true,
      json: async () => String(url).endsWith("/status")
        ? statusResponse
        : { calendars: [], hasCalendarListScope: true },
    })) as jest.Mock;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    globalThis.fetch = originalFetch;
  });

  for (const modalName of ["event", "todo", "settings"] as const) {
    it(`keeps the ${modalName} dialog open when a selection ends on its backdrop`, async () => {
      const onClose = jest.fn();
      let modal;
      if (modalName === "event") {
        modal = createElement(EventFormModal, { onClose, onSave: jest.fn() });
      } else if (modalName === "todo") {
        modal = createElement(TodoFormModal, { initialDate: new Date(), onClose, onSave: jest.fn() });
      } else {
        modal = settingsModal(onClose);
      }
      await act(async () => root.render(modal));

      const backdrop = document.querySelector<HTMLElement>(".fixed.inset-0")!;
      const input = backdrop.querySelector("input")!;
      await act(async () => {
        input.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
        backdrop.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
        backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(onClose).not.toHaveBeenCalled();

      await act(async () => {
        backdrop.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  }

  it.each([false, true])("preserves the repeat end date and all-day flag (%s) when reopening a copy", async (allDay) => {
    const event: CalendarEvent = {
      id: "copied-event", originalId: "copied-event", title: "Copied event",
      description: null, link: null, color: "#4285F4", allDay,
      startTime: "2026-10-23T19:00:00.000Z", endTime: "2026-10-23T20:00:00.000Z",
      recurrenceRule: "FREQ=DAILY", recurrenceEndDate: "2026-10-25T00:00:00.000Z",
      isRecurringInstance: false, reminderMinutes: null, reminderDisabled: false,
    };
    const onSave = jest.fn();
    (globalThis.fetch as jest.Mock).mockResolvedValue({ ok: true, text: async () => JSON.stringify(event) });
    await act(async () => root.render(createElement(EventFormModal, { event, onClose: jest.fn(), onSave })));
    const endRepeatLabel = Array.from(container.querySelectorAll("label")).find(
      (label) => label.textContent === "End repeat on"
    )!;
    expect((document.getElementById(endRepeatLabel.htmlFor) as HTMLInputElement).value).toBe("2026-10-25");
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const [url, request] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("/api/events/copied-event");
    expect(JSON.parse(request.body)).toMatchObject({
      recurrenceEndDate: "2026-10-25T00:00:00.000Z",
      allDay,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ recurrenceEndDate: event.recurrenceEndDate }));
  });

  it("replaces an imported UNTIL when editing its ends-on date", async () => {
    const event: CalendarEvent = {
      id: "copy-1", originalId: "copy-1", title: "Copied class", description: null, link: null,
      color: "#4285F4", allDay: false, startTime: "2026-10-23T19:00:00.000Z", endTime: "2026-10-23T20:00:00.000Z",
      recurrenceRule: "FREQ=WEEKLY;UNTIL=20261030T045959Z", recurrenceEndDate: null,
      isRecurringInstance: false, reminderMinutes: null, reminderDisabled: false,
    };
    (globalThis.fetch as jest.Mock).mockResolvedValue({ ok: true, text: async () => JSON.stringify(event) });
    await act(async () => root.render(createElement(EventFormModal, { event, onClose: jest.fn(), onSave: jest.fn() })));
    const label = Array.from(container.querySelectorAll("label")).find((label) => label.textContent === "End repeat on")!;
    const input = document.getElementById(label.htmlFor) as HTMLInputElement;
    expect(input.value).not.toBe("");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "2026-11-12");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(JSON.parse((globalThis.fetch as jest.Mock).mock.calls[0][1].body)).toMatchObject({
      recurrenceRule: "FREQ=WEEKLY", recurrenceEndDate: "2026-11-12T00:00:00.000Z",
    });
  });

  it("refreshes status and offers Google consent when access has expired", async () => {
    await act(async () => root.render(settingsModal()));
    const syncTab = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Sync")!;
    await act(async () => syncTab.click());
    statusResponse = { ...connectedStatus, requiresReconnect: true };
    const refreshButton = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Refresh status")!;
    await act(async () => refreshButton.click());

    const reconnectButton = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Reconnect Google Calendar")!;
    expect(reconnectButton).toBeDefined();
    expect(document.body.textContent).toContain("Google access expired. Reconnect to resume sync.");
    await act(async () => reconnectButton.click());
    expect(signIn).toHaveBeenCalledWith("google", { callbackUrl: "/calendar" }, {
      access_type: "offline",
      prompt: "consent",
      scope: expect.stringContaining("calendar.events"),
    });
  });

  it("shows connection-check errors without silently replacing the last status", async () => {
    await act(async () => root.render(settingsModal()));
    const syncTab = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Sync")!;
    await act(async () => syncTab.click());
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Google is temporarily unavailable." }),
    });
    const refreshButton = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Refresh status")!;
    await act(async () => refreshButton.click());
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Google is temporarily unavailable.");
    expect(document.body.textContent).toContain("Connected, instant sync on");
  });
});
