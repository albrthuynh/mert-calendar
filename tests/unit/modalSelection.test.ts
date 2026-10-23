/** @jest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EventFormModal } from "@/app/components/EventFormModal";
import { TodoFormModal } from "@/app/components/TodoFormModal";
import { SettingsModal } from "@/app/components/SettingsModal";
import { GoogleCalendarConnectionProvider } from "@/app/context/GoogleCalendarConnectionContext";
import { signIn } from "next-auth/react";

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
