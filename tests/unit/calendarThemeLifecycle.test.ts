/** @jest-environment jsdom */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { CalendarTheme } from "@/app/components/CalendarTheme";
import { useCalendarPreferences } from "@/app/context/CalendarPreferencesContext";

jest.mock("@/app/context/CalendarPreferencesContext", () => ({ useCalendarPreferences: jest.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("themes headers and portal dialogs through the document, then restores defaults on reset and navigation", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const themeRoot = document.documentElement;
  themeRoot.classList.add("dark");
  try {
    (useCalendarPreferences as jest.Mock).mockReturnValue({ calendarColor: "#000000" });
    await act(async () => root.render(createElement(CalendarTheme)));
    expect(themeRoot.dataset.calendarTone).toBe("dark");
    expect(themeRoot.style.getPropertyValue("--calendar-custom-color")).toBe("#000000");

    (useCalendarPreferences as jest.Mock).mockReturnValue({ calendarColor: "#ffffff" });
    await act(async () => root.render(createElement(CalendarTheme)));
    expect(themeRoot.dataset.calendarTone).toBe("light");
    expect(themeRoot.classList.contains("dark")).toBe(true);

    (useCalendarPreferences as jest.Mock).mockReturnValue({ calendarColor: null });
    await act(async () => root.render(createElement(CalendarTheme)));
    expect(themeRoot.dataset.calendarTone).toBeUndefined();
    expect(themeRoot.style.getPropertyValue("--calendar-custom-color")).toBe("");

    (useCalendarPreferences as jest.Mock).mockReturnValue({ calendarColor: "#000000" });
    await act(async () => root.render(createElement(CalendarTheme)));
  } finally {
    await act(async () => root.unmount());
    themeRoot.classList.remove("dark");
  }
  expect(themeRoot.dataset.calendarTone).toBeUndefined();
  expect(themeRoot.style.getPropertyValue("--calendar-custom-color")).toBe("");
});
