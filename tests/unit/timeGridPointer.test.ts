/** @jest-environment jsdom */

import { act, createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TimeGrid } from "@/app/components/TimeGrid";
import { HOUR_HEIGHT } from "@/lib/calendarConstants";
import type { CalendarEvent } from "@/types/calendar";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const day = new Date(2026, 9, 23);
const event: CalendarEvent = {
  id: "event-1", originalId: "event-1", title: "Meeting", description: null, link: null,
  startTime: new Date(2026, 9, 23, 9).toISOString(), endTime: new Date(2026, 9, 23, 10).toISOString(),
  color: "#4285F4", allDay: false, recurrenceRule: null, recurrenceEndDate: null,
  reminderMinutes: null, reminderDisabled: false, isRecurringInstance: false,
};

type PointerOptions = MouseEventInit & { pointerId?: number; pointerType?: string; isPrimary?: boolean };

function pointerEvent(type: string, options: PointerOptions = {}) {
  const pointer = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: 200, clientY: 128, ...options });
  Object.defineProperties(pointer, {
    pointerId: { value: options.pointerId ?? 1 },
    pointerType: { value: options.pointerType ?? "mouse" },
    isPrimary: { value: options.isPrimary ?? true },
  });
  return pointer;
}

describe("calendar pointer gestures", () => {
  let root: Root;
  let container: HTMLDivElement;
  let column: HTMLElement;
  let grid: HTMLElement;
  let captures: WeakMap<HTMLElement, Set<number>>;
  const onSlotClick = jest.fn();
  const onSlotDragCreate = jest.fn();
  const onEventClick = jest.fn();
  const onEventMove = jest.fn();
  const onEventResize = jest.fn();
  const originalCaptureDescriptors = new Map<string, PropertyDescriptor | undefined>();

  beforeAll(() => {
    for (const method of ["setPointerCapture", "hasPointerCapture", "releasePointerCapture"]) {
      originalCaptureDescriptors.set(method, Object.getOwnPropertyDescriptor(HTMLElement.prototype, method));
    }
    Object.defineProperties(HTMLElement.prototype, {
      setPointerCapture: { configurable: true, value: jest.fn(function (this: HTMLElement, pointerId: number) {
        const ownedPointers = captures.get(this) ?? new Set<number>();
        ownedPointers.add(pointerId);
        captures.set(this, ownedPointers);
      }) },
      hasPointerCapture: { configurable: true, value: function (this: HTMLElement, pointerId: number) { return captures.get(this)?.has(pointerId) ?? false; } },
      releasePointerCapture: { configurable: true, value: function (this: HTMLElement, pointerId: number) { captures.get(this)?.delete(pointerId); } },
    });
  });

  afterAll(() => {
    for (const [method, descriptor] of originalCaptureDescriptors) {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, method, descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, method);
    }
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    captures = new WeakMap();
    jest.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 700, 24 * HOUR_HEIGHT));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(createElement(TimeGrid, {
      scrollRef: createRef<HTMLDivElement>(), weekDays: [day], currentTime: null, events: [event],
      onSlotClick, onSlotDragCreate, onEventClick, onEventMove, onEventResize,
    })));
    column = container.querySelector<HTMLElement>("[data-event]")!.parentElement!;
    grid = column.parentElement!;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    jest.restoreAllMocks();
  });

  async function dispatch(target: EventTarget, type: string, options?: PointerOptions) {
    await act(async () => { target.dispatchEvent(pointerEvent(type, options)); });
  }

  function expectNoActions() {
    for (const callback of [onSlotClick, onSlotDragCreate, onEventClick, onEventMove, onEventResize]) {
      expect(callback).not.toHaveBeenCalled();
    }
  }

  for (const [label, options] of [
    ["right click", { button: 2, buttons: 2 }],
    ["middle click", { button: 1, buttons: 4 }],
    ["Control-click", { ctrlKey: true }],
    ["secondary touch", { pointerType: "touch", isPrimary: false }],
  ] as const) {
    it(`ignores ${label} on empty slots, events, and resize handles`, async () => {
      for (const target of [column, column.querySelector<HTMLElement>("[data-event]")!, column.querySelector<HTMLElement>('[data-resize="start"]')!]) {
        await dispatch(target, "pointerdown", options);
        const contextMenu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
        await act(async () => { target.dispatchEvent(contextMenu); });
        expect(contextMenu.defaultPrevented).toBe(false);
        // Browsers can dismiss their menu without delivering the original pointerup.
        await dispatch(column, "pointermove", { buttons: 0, clientY: 300 });
        await dispatch(column, "pointerup");
      }
      expectNoActions();
      expect(HTMLElement.prototype.setPointerCapture).not.toHaveBeenCalled();
    });
  }

  it("preserves left-click creation and drag-to-create", async () => {
    await dispatch(column, "pointerdown");
    await dispatch(column, "pointerup");
    expect(onSlotClick).toHaveBeenCalledWith(new Date(2026, 9, 23, 2));
    await dispatch(column, "pointerdown");
    await dispatch(column, "pointermove", { clientY: 4 * HOUR_HEIGHT });
    await dispatch(column, "pointerup", { clientY: 4 * HOUR_HEIGHT });
    expect(onSlotDragCreate).toHaveBeenCalledWith(new Date(2026, 9, 23, 2), new Date(2026, 9, 23, 4), day);
    expect(column.hasPointerCapture(1)).toBe(false);
  });

  it("preserves event clicks, moves, and resizes with the left button", async () => {
    await dispatch(column.querySelector("[data-event]")!, "pointerdown");
    await dispatch(grid, "pointerup");
    expect(onEventClick).toHaveBeenCalledTimes(1);
    await dispatch(column.querySelector("[data-event]")!, "pointerdown", { clientY: 9 * HOUR_HEIGHT });
    await dispatch(grid, "pointermove", { clientY: 10 * HOUR_HEIGHT });
    await dispatch(grid, "pointermove", { clientY: 12 * HOUR_HEIGHT });
    await dispatch(grid, "pointerup", { clientY: 12 * HOUR_HEIGHT });
    expect(onEventMove).toHaveBeenCalledWith(event, new Date(2026, 9, 23, 12), new Date(2026, 9, 23, 13));
    await dispatch(column.querySelector('[data-resize="end"]')!, "pointerdown", { clientY: 10 * HOUR_HEIGHT });
    await dispatch(grid, "pointermove", { clientY: 11 * HOUR_HEIGHT });
    await dispatch(grid, "pointerup", { clientY: 11 * HOUR_HEIGHT });
    expect(onEventResize).toHaveBeenCalledWith(event, new Date(2026, 9, 23, 9), new Date(2026, 9, 23, 11));
    expect(grid.hasPointerCapture(1)).toBe(false);
  });

  for (const interruption of ["contextmenu", "Escape", "blur", "pointercancel", "lostpointercapture", "no buttons", "extra buttons", "outside release"]) {
    it(`cancels creation, moving, and resizing on ${interruption}`, async () => {
      for (const gesture of ["create", "move", "resize"]) {
        const target = gesture === "create" ? column : gesture === "move" ? column.querySelector("[data-event]")! : column.querySelector('[data-resize="end"]')!;
        const captureTarget = gesture === "create" ? column : grid;
        await dispatch(target, "pointerdown");
        await dispatch(captureTarget, "pointermove", { clientY: 300 });
        if (interruption === "Escape") {
          await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true })); });
        } else if (interruption === "blur") {
          await act(async () => { window.dispatchEvent(new Event("blur")); });
        } else if (interruption === "contextmenu") {
          await act(async () => { target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })); });
        } else if (interruption === "no buttons" || interruption === "extra buttons") {
          await dispatch(captureTarget, "pointermove", { buttons: interruption === "no buttons" ? 0 : 3 });
        } else if (interruption === "outside release") {
          await dispatch(document.body, "pointerup");
        } else {
          await dispatch(captureTarget, interruption);
        }
        await dispatch(column, "pointermove", { clientY: 400, buttons: 0 });
        await dispatch(column, "pointerup");
        expectNoActions();
        expect(captureTarget.hasPointerCapture(1)).toBe(false);
      }
      await dispatch(column, "pointerdown");
      await dispatch(column, "pointerup");
      expect(onSlotClick).toHaveBeenCalledTimes(1);
    });
  }

  it("ignores movement and release from a different pointer", async () => {
    await dispatch(column, "pointerdown");
    await dispatch(column, "pointermove", { pointerId: 2, clientY: 400 });
    await dispatch(column, "pointerup", { pointerId: 2 });
    expectNoActions();
    expect(column.hasPointerCapture(1)).toBe(true);
    await dispatch(column, "pointerup");
    expect(onSlotClick).toHaveBeenCalledTimes(1);
  });

  for (const pointerType of ["touch", "pen"]) {
    it(`still accepts the primary ${pointerType} pointer`, async () => {
      await dispatch(column, "pointerdown", { pointerType });
      await dispatch(column, "pointerup", { pointerType });
      expect(onSlotClick).toHaveBeenCalledTimes(1);
    });
  }
});
