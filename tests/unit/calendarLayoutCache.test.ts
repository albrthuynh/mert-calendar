/** @jest-environment jsdom */
import { act, createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import { TimeGrid } from "@/app/components/TimeGrid";
import * as layouts from "@/lib/calendarEventLayout";
import type { CalendarEvent } from "@/types/calendar";

jest.mock("@/lib/calendarEventLayout", () => ({
  layoutEvents: jest.fn(jest.requireActual("@/lib/calendarEventLayout").layoutEvents),
}));

it("reuses day layouts for clock renders and recomputes after event changes", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.createElement("div"));
  const layout = layouts.layoutEvents as jest.Mock;
  const props = {
    scrollRef: createRef<HTMLDivElement>(), weekDays: [new Date(2026, 9, 28), new Date(2026, 9, 29)],
    events: [] as CalendarEvent[], onSlotClick: jest.fn(), onEventClick: jest.fn(),
  };
  try {
    await act(async () => root.render(createElement(TimeGrid, { ...props, currentTime: null })));
    expect(layout).toHaveBeenCalledTimes(2);
    await act(async () => root.render(createElement(TimeGrid, { ...props, currentTime: new Date() })));
    expect(layout).toHaveBeenCalledTimes(2);
    await act(async () => root.render(createElement(TimeGrid, { ...props, events: [], currentTime: new Date() })));
    expect(layout).toHaveBeenCalledTimes(4);
  } finally {
    await act(async () => root.unmount());
    layout.mockClear();
  }
});
