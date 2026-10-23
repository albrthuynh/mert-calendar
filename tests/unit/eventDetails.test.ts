/** @jest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EventDetailPopover } from "@/app/components/EventDetailPopover";
import { EventDescription } from "@/app/components/EventDescription";
import { RecurrenceSelector } from "@/app/components/RecurrenceSelector";
import { EventGuestInvites } from "@/app/components/EventGuestInvites";
import { getRecurrenceLabel } from "@/lib/eventRecurrenceLabel";
import type { CalendarEvent } from "@/types/calendar";

const mockMarkReconnectRequired = jest.fn();
jest.mock("@/app/context/GoogleCalendarConnectionContext", () => ({
  useGoogleCalendarConnection: () => ({ canInviteGuests: true, markReconnectRequired: mockMarkReconnectRequired }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const event: CalendarEvent = {
  id: "event-1", originalId: "event-1", title: "V-SWEP 1:1 SESSION",
  description: 'Your <b>Google Meet link</b><br><a href="https://example.com/assessment">Assessment</a>',
  link: null, startTime: "2026-10-23T19:00:00.000Z", endTime: "2026-10-23T20:00:00.000Z",
  color: "#4285F4", allDay: false, recurrenceRule: "FREQ=WEEKLY;UNTIL=20261212T080000Z",
  recurrenceEndDate: null, reminderMinutes: null, reminderDisabled: false, isRecurringInstance: true,
};

describe("event detail presentation", () => {
  let root: Root;
  let container: HTMLDivElement;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ connected: true, enabled: true, hasCalendarScope: true }) })) as jest.Mock;
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    globalThis.fetch = originalFetch;
  });

  it("formats Google's UNTIL rule instead of displaying raw RRULE text", () => {
    expect(getRecurrenceLabel(event.recurrenceRule!)).toBe("Every week until December 12, 2026");
    expect(getRecurrenceLabel("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE")).toBe("Every 2 weeks on Monday, Wednesday");
    expect(getRecurrenceLabel("invalid-rule")).toBe("Repeats on a custom schedule");
  });

  it("preserves an imported custom rule in the recurrence selector", async () => {
    await act(async () => root.render(createElement(RecurrenceSelector, { value: event.recurrenceRule!, onChange: jest.fn() })));
    const select = container.querySelector("select")!;
    expect(select.value).toBe(event.recurrenceRule);
    expect(select.selectedOptions[0].textContent).toBe("Every week until December 12, 2026");
  });

  it("renders safe formatting and links while excluding active imported markup", async () => {
    await act(async () => root.render(createElement(EventDescription, {
      description: `${event.description}<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">Unsafe link</a><strong onclick="alert(1)">Notes</strong>`,
    })));
    expect(container.querySelector("b")?.textContent).toBe("Google Meet link");
    expect(container.querySelector("a")?.href).toBe("https://example.com/assessment");
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(container.querySelector("script, img, [onclick], [onerror]")).toBeNull();
    expect(container.textContent).toContain("Unsafe link");
    expect(container.textContent).not.toContain("alert(1)");
  });

  it("keeps the scroll region within the viewport and the header outside it", async () => {
    await act(async () => root.render(createElement(EventDetailPopover, {
      event, anchorRect: { top: 400, right: 200, left: 100 } as DOMRect,
      onClose: jest.fn(), onEdit: jest.fn(), onDelete: jest.fn(),
    })));
    const popup = container.querySelector<HTMLElement>('[role="dialog"]')!;
    const details = container.querySelector<HTMLElement>('[aria-label="Event details"]')!;
    expect(Number.parseFloat(popup.style.top) + Number.parseFloat(popup.style.maxHeight)).toBeLessThanOrEqual(window.innerHeight - 8);
    expect(details.className).toContain("overflow-y-auto");
    expect(details.contains(container.querySelector("h3"))).toBe(false);
    expect(container.textContent).not.toContain("FREQ=");
    expect(container.querySelector("b")?.textContent).toBe("Google Meet link");
    expect(container.textContent).toContain("Invite guests");
  });

  it("does not move an event when arrow keys scroll its details", async () => {
    const onMoveTime = jest.fn();
    await act(async () => root.render(createElement(EventDetailPopover, {
      event: { ...event, recurrenceRule: null, isRecurringInstance: false },
      anchorRect: { top: 50, right: 200, left: 100 } as DOMRect,
      onClose: jest.fn(), onEdit: jest.fn(), onDelete: jest.fn(), onMoveTime,
    })));
    const details = container.querySelector<HTMLElement>('[aria-label="Event details"]')!;
    await act(async () => details.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(onMoveTime).not.toHaveBeenCalled();
  });

  async function enterEmail(email: string) {
    const input = document.querySelector<HTMLInputElement>('[aria-modal="true"] input[type="email"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, email);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return input;
  }

  async function addEmail(email: string) {
    const input = await enterEmail(email);
    const enterKey = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => {
      input.dispatchEvent(enterKey);
    });
    expect(enterKey.defaultPrevented).toBe(true);
    return input;
  }

  it("builds a removable email list with Enter and sends only after Send is chosen", async () => {
    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ guests: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ invitedCount: 1 }) });
    await act(async () => root.render(createElement(EventGuestInvites, { event, onClose: jest.fn() })));
    const dialog = document.querySelector<HTMLElement>('[aria-modal="true"]')!;
    expect(dialog.closest(".fixed")?.className).toContain("items-center justify-center");
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.querySelector("select")?.value).toBe("event");
    const input = await addEmail(" Friend@Example.com ");
    await addEmail("colleague@example.com");
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
    expect(dialog.querySelector('[aria-label="Guests to invite"]')?.textContent).toContain("friend@example.com");
    expect((globalThis.fetch as jest.Mock).mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
    await act(async () => {
      dialog.querySelector<HTMLButtonElement>('[aria-label="Remove colleague@example.com"]')!.click();
    });
    await act(async () => dialog.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const request = (globalThis.fetch as jest.Mock).mock.calls[1][1];
    expect(JSON.parse(request.body)).toMatchObject({
      emails: ["friend@example.com"], scope: "event", instanceStartTime: event.startTime,
    });
    expect(dialog.textContent).toContain("Invitations sent through Google Calendar.");
    expect(dialog.querySelector('[aria-label="Guests to invite"]')).toBeNull();
  });

  it("rejects invalid and duplicate email entries without sending invitations", async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ guests: [] }) });
    await act(async () => root.render(createElement(EventGuestInvites, { event, onClose: jest.fn() })));
    await addEmail("not-an-email");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Invalid guest email");
    await addEmail("friend@example.com");
    await addEmail("FRIEND@example.com");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("already on the guest list");
    expect(document.querySelectorAll('[aria-label="Guests to invite"] li')).toHaveLength(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps pending emails when changing between one occurrence and the whole series", async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ guests: [] }) });
    await act(async () => root.render(createElement(EventGuestInvites, { event, onClose: jest.fn() })));
    await addEmail("friend@example.com");
    const select = document.querySelector("select")!;
    await act(async () => {
      select.value = "series";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(document.querySelector('[aria-label="Guests to invite"]')?.textContent).toContain("friend@example.com");
    expect((globalThis.fetch as jest.Mock).mock.calls[1][0]).toContain("scope=series");
  });

  it("includes a final typed address when Send is clicked before Enter", async () => {
    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ guests: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ invitedCount: 2 }) });
    await act(async () => root.render(createElement(EventGuestInvites, { event, onClose: jest.fn() })));
    await addEmail("friend@example.com");
    await enterEmail("colleague@example.com");
    await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(JSON.parse((globalThis.fetch as jest.Mock).mock.calls[1][1].body).emails).toEqual(["friend@example.com", "colleague@example.com"]);
  });

  it("closes only the guest modal on Escape and restores focus to its opener", async () => {
    const onClose = jest.fn();
    (globalThis.fetch as jest.Mock).mockImplementation(async (url) => ({
      ok: true,
      json: async () => String(url).includes("/guests") ? { guests: [] } : { connected: true, enabled: true, hasCalendarScope: true },
    }));
    await act(async () => root.render(createElement(EventDetailPopover, {
      event, anchorRect: { top: 50, right: 200, left: 100 } as DOMRect,
      onClose, onEdit: jest.fn(), onDelete: jest.fn(),
    })));
    const opener = container.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')!;
    opener.focus();
    await act(async () => opener.click());
    const input = document.querySelector<HTMLInputElement>('[aria-modal="true"] input')!;
    await act(async () => input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('[aria-modal="true"]')).not.toBeNull();
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe("");
  });

  it("traps keyboard focus in the modal and does not dismiss when a selection ends outside", async () => {
    const onClose = jest.fn();
    (globalThis.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ guests: [] }) });
    await act(async () => root.render(createElement(EventGuestInvites, { event, onClose })));
    const dialog = document.querySelector<HTMLElement>('[aria-modal="true"]')!;
    const firstControl = dialog.querySelector<HTMLButtonElement>("button")!;
    firstControl.focus();
    await act(async () => firstControl.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement?.textContent).toBe("Cancel");
    const backdrop = dialog.parentElement!;
    const input = dialog.querySelector("input")!;
    await act(async () => {
      input.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      backdrop.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
      backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => backdrop.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
