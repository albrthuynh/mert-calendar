"use client";

import { RefObject, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { isToday, isSameDay, startOfDay, endOfDay, format } from "date-fns";
import { HOUR_HEIGHT } from "@/lib/calendarConstants";
import {
  snapToMinutes,
  pixelYToTime,
} from "@/lib/timeGridUtils";
import { CalendarEvent } from "@/types/calendar";
import { EventBlock } from "./EventBlock";

const DRAG_THRESHOLD_PX = 10;
const SNAP_MINUTES = 30;
const MIN_DURATION_MINUTES = 15;

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function hourLabel(hour: number): string {
  if (hour === 0) return "";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

/** Group overlapping events into columns so they don't completely overlap. */
function layoutEvents(events: CalendarEvent[]): Array<{
  event: CalendarEvent;
  column: number;
  totalColumns: number;
}> {
  if (events.length === 0) return [];

  const sorted = [...events].sort(
    (a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  type LayoutItem = {
    event: CalendarEvent;
    column: number;
    totalColumns: number;
  };

  const result: LayoutItem[] = [];
  // Groups of overlapping events
  const groups: CalendarEvent[][] = [];

  for (const event of sorted) {
    const eStart = new Date(event.startTime).getTime();
    const eEnd = new Date(event.endTime).getTime();
    let placed = false;

    for (const group of groups) {
      const groupEnd = Math.max(
        ...group.map((g) => new Date(g.endTime).getTime())
      );
      if (eStart < groupEnd) {
        group.push(event);
        placed = true;
        break;
      }
    }

    if (!placed) groups.push([event]);
  }

  for (const group of groups) {
    const cols: CalendarEvent[][] = [];
    for (const event of group) {
      const eStart = new Date(event.startTime).getTime();
      let placed = false;
      for (const col of cols) {
        const colEnd = Math.max(
          ...col.map((c) => new Date(c.endTime).getTime())
        );
        if (eStart >= colEnd) {
          col.push(event);
          placed = true;
          break;
        }
      }
      if (!placed) cols.push([event]);
    }

    const total = cols.length;
    cols.forEach((col, colIdx) => {
      col.forEach((event) => {
        result.push({ event, column: colIdx, totalColumns: total });
      });
    });
  }

  return result;
}

interface CreatePreview {
  day: Date;
  startDate: Date;
  endDate: Date;
}

interface ResizePreview {
  event: CalendarEvent;
  startTime: Date;
  endTime: Date;
}

interface MovePreview {
  event: CalendarEvent;
  startTime: Date;
  endTime: Date;
}

interface TimeGridProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  weekDays: Date[];
  currentTime: Date | null;
  events: CalendarEvent[];
  onSlotClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent, rect: DOMRect) => void;
  onSlotDragCreate?: (start: Date, end: Date, day: Date) => void;
  onEventResize?: (event: CalendarEvent, startTime: Date, endTime: Date) => void;
  onEventMove?: (event: CalendarEvent, startTime: Date, endTime: Date) => void;
}

const TIME_LABEL_WIDTH = 56; // w-14

export function TimeGrid({
  scrollRef,
  weekDays,
  currentTime,
  events,
  onSlotClick,
  onEventClick,
  onSlotDragCreate,
  onEventResize,
  onEventMove,
}: TimeGridProps) {
  const gridInnerRef = useRef<HTMLDivElement>(null);
  const [createPreview, setCreatePreview] = useState<CreatePreview | null>(null);
  const createPreviewRef = useRef<CreatePreview | null>(null);
  createPreviewRef.current = createPreview;
  const dragCreateRef = useRef<{
    day: Date;
    startY: number;
    startDate: Date;
    isDrag: boolean;
  } | null>(null);

  const [resizePreview, setResizePreview] = useState<ResizePreview | null>(null);
  const resizeRef = useRef<{
    event: CalendarEvent;
    edge: "start" | "end";
    day: Date;
    initialY: number;
    initialStart: Date;
    initialEnd: Date;
    eventElement: HTMLElement | null;
  } | null>(null);

  const [movePreview, setMovePreview] = useState<MovePreview | null>(null);
  const [dragClone, setDragClone] = useState<{
    event: CalendarEvent;
    x: number;
    y: number;
    width: number;
    height: number;
    previewStartTime: Date;
    previewEndTime: Date;
  } | null>(null);
  const moveRef = useRef<{
    event: CalendarEvent;
    initialStart: Date;
    initialEnd: Date;
    initialClientX: number;
    initialClientY: number;
    day: Date;
    isDrag: boolean;
    eventElement: HTMLElement | null;
    cloneOffsetX: number;
    cloneOffsetY: number;
  } | null>(null);

  const currentTimeTop =
    currentTime === null
      ? null
      : ((currentTime.getHours() * 60 + currentTime.getMinutes()) / 60) *
        HOUR_HEIGHT;

  const clearCreateDrag = useCallback(() => {
    dragCreateRef.current = null;
    setCreatePreview(null);
  }, []);

  const handleColumnPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, day: Date) => {
      if ((e.target as HTMLElement).closest("[data-event]")) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = e.currentTarget.getBoundingClientRect();
      const startY = e.clientY - rect.top;
      const startDate = pixelYToTime(day, startY);
      dragCreateRef.current = {
        day,
        startY,
        startDate,
        isDrag: false,
      };
    },
    []
  );

  const handleColumnPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, day: Date) => {
      const ref = dragCreateRef.current;
      if (!ref || ref.day.getTime() !== day.getTime()) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const currentY = e.clientY - rect.top;
      if (!ref.isDrag) {
        if (Math.abs(currentY - ref.startY) <= DRAG_THRESHOLD_PX) return;
        ref.isDrag = true;
      }
      let rangeEnd = pixelYToTime(day, currentY);
      const dayEnd = endOfDay(day);
      if (rangeEnd > dayEnd) rangeEnd = new Date(dayEnd);
      let rangeStart = ref.startDate;
      if (rangeEnd < rangeStart) [rangeStart, rangeEnd] = [rangeEnd, rangeStart];
      let startSnap = snapToMinutes(rangeStart, SNAP_MINUTES);
      let endSnap = snapToMinutes(rangeEnd, SNAP_MINUTES);
      if (startSnap >= endSnap) {
        endSnap = new Date(startSnap.getTime() + MIN_DURATION_MINUTES * 60 * 1000);
        if (endSnap > dayEnd) {
          endSnap = new Date(dayEnd);
          startSnap = new Date(endSnap.getTime() - MIN_DURATION_MINUTES * 60 * 1000);
        }
      }
      const durationMs = endSnap.getTime() - startSnap.getTime();
      if (durationMs < MIN_DURATION_MINUTES * 60 * 1000) {
        endSnap = new Date(startSnap.getTime() + MIN_DURATION_MINUTES * 60 * 1000);
        if (endSnap > dayEnd) {
          endSnap = new Date(dayEnd);
          startSnap = new Date(endSnap.getTime() - MIN_DURATION_MINUTES * 60 * 1000);
        }
      }
      setCreatePreview({ day, startDate: startSnap, endDate: endSnap });
    },
    []
  );

  const handleColumnPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, day: Date) => {
      const ref = dragCreateRef.current;
      const preview = createPreviewRef.current;
      e.currentTarget.releasePointerCapture(e.pointerId);
      if (!ref || ref.day.getTime() !== day.getTime()) {
        clearCreateDrag();
        return;
      }
      clearCreateDrag();
      if (ref.isDrag && preview && onSlotDragCreate) {
        onSlotDragCreate(preview.startDate, preview.endDate, preview.day);
      } else if (!ref.isDrag) {
        const clickedDate = snapToMinutes(ref.startDate, SNAP_MINUTES);
        onSlotClick(clickedDate);
      }
    },
    [onSlotDragCreate, onSlotClick, clearCreateDrag]
  );

  const handleColumnPointerCancel = useCallback(
    (_e: React.PointerEvent<HTMLDivElement>) => {
      clearCreateDrag();
    },
    [clearCreateDrag]
  );

  const getColumnAndLocalY = useCallback(
    (clientX: number, clientY: number): { day: Date; localY: number } | null => {
      const grid = gridInnerRef.current;
      const scroll = scrollRef.current;
      if (!grid || !scroll) return null;
      const gridRect = grid.getBoundingClientRect();
      const scrollRect = scroll.getBoundingClientRect();
      const columnsLeft = gridRect.left + TIME_LABEL_WIDTH;
      const colWidth = (gridRect.width - TIME_LABEL_WIDTH) / weekDays.length;
      const colIndex = Math.max(
        0,
        Math.min(
          weekDays.length - 1,
          Math.floor((Math.max(columnsLeft, Math.min(gridRect.right, clientX)) - columnsLeft) / colWidth)
        )
      );
      const day = weekDays[colIndex];
      // Convert viewport Y to content Y: visible top is at scrollRect.top, content starts at scrollTop
      const rawLocalY = clientY - scrollRect.top + scroll.scrollTop;
      const maxLocalY = 24 * HOUR_HEIGHT;
      const localY = Math.max(0, Math.min(maxLocalY, rawLocalY));
      return { day, localY };
    },
    [weekDays]
  );

  const handleEventWrapperPointerDown = useCallback(
    (e: React.PointerEvent, event: CalendarEvent, day: Date) => {
      if (event.isRecurringInstance || event.recurrenceRule) return;
      e.stopPropagation();
      const target = e.target as HTMLElement;
      const resizeStart = target.closest('[data-resize="start"]');
      const resizeEnd = target.closest('[data-resize="end"]');
      const grid = gridInnerRef.current;
      const column = (e.currentTarget as HTMLElement).parentElement;
      const columnRect = column?.getBoundingClientRect();
      const scrollTop = scrollRef.current?.scrollTop ?? 0;
      if (!grid) return;
      if (resizeStart && columnRect) {
        grid.setPointerCapture(e.pointerId);
        const localY = e.clientY - columnRect.top + scrollTop;
        resizeRef.current = {
          event,
          edge: "start",
          day,
          initialY: localY,
          initialStart: new Date(event.startTime),
          initialEnd: new Date(event.endTime),
          eventElement: e.currentTarget as HTMLElement,
        };
      } else if (resizeEnd && columnRect) {
        grid.setPointerCapture(e.pointerId);
        const localY = e.clientY - columnRect.top + scrollTop;
        resizeRef.current = {
          event,
          edge: "end",
          day,
          initialY: localY,
          initialStart: new Date(event.startTime),
          initialEnd: new Date(event.endTime),
          eventElement: e.currentTarget as HTMLElement,
        };
      } else {
        moveRef.current = {
          event,
          initialStart: new Date(event.startTime),
          initialEnd: new Date(event.endTime),
          initialClientX: e.clientX,
          initialClientY: e.clientY,
          day,
          isDrag: false,
          eventElement: e.currentTarget as HTMLElement,
          cloneOffsetX: 0,
          cloneOffsetY: 0,
        };
      }
    },
    []
  );

  const handleGridPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const res = resizeRef.current;
      const mov = moveRef.current;
      if (res) {
        const grid = gridInnerRef.current;
        const scroll = scrollRef.current;
        if (!grid || !scroll) return;
        const rect = grid.getBoundingClientRect();
        const localY = e.clientY - rect.top + scroll.scrollTop;
        const deltaPx = localY - res.initialY;
        const deltaMinutes = (deltaPx / HOUR_HEIGHT) * 60;
        const snapDelta = Math.round(deltaMinutes / SNAP_MINUTES) * SNAP_MINUTES;
        let newStart = new Date(res.initialStart);
        let newEnd = new Date(res.initialEnd);
        if (res.edge === "start") {
          // Drag top edge: change start only → event gets shorter or longer
          newStart = snapToMinutes(
            new Date(res.initialStart.getTime() + snapDelta * 60 * 1000),
            SNAP_MINUTES
          );
          if (newStart >= newEnd) newStart = new Date(newEnd.getTime() - MIN_DURATION_MINUTES * 60 * 1000);
          // Keep end fixed
          newEnd = new Date(res.initialEnd);
        } else {
          // Drag bottom edge: change end only → event gets shorter or longer
          newEnd = snapToMinutes(
            new Date(res.initialEnd.getTime() + snapDelta * 60 * 1000),
            SNAP_MINUTES
          );
          if (newEnd <= newStart) newEnd = new Date(newStart.getTime() + MIN_DURATION_MINUTES * 60 * 1000);
          // Keep start fixed
          newStart = new Date(res.initialStart);
        }
        setResizePreview({ event: res.event, startTime: newStart, endTime: newEnd });
      } else if (mov) {
        if (!mov.isDrag) {
          const dx = e.clientX - mov.initialClientX;
          const dy = e.clientY - mov.initialClientY;
          if (Math.abs(dx) <= DRAG_THRESHOLD_PX && Math.abs(dy) <= DRAG_THRESHOLD_PX) return;
          mov.isDrag = true;
          const grid = gridInnerRef.current;
          if (grid) grid.setPointerCapture(e.pointerId);
          const blockEl = mov.eventElement?.firstElementChild as HTMLElement | null;
          const elRect = blockEl?.getBoundingClientRect() ?? mov.eventElement?.getBoundingClientRect();
          if (elRect) {
            mov.cloneOffsetX = elRect.width / 2;
            mov.cloneOffsetY = elRect.height / 2;
            setDragClone({
              event: mov.event,
              x: e.clientX - elRect.width / 2,
              y: e.clientY - elRect.height / 2,
              width: elRect.width,
              height: elRect.height,
              previewStartTime: mov.initialStart,
              previewEndTime: mov.initialEnd,
            });
          }
        } else {
          const pos = getColumnAndLocalY(e.clientX, e.clientY);
          if (pos) {
            const newStart = snapToMinutes(pixelYToTime(pos.day, pos.localY), SNAP_MINUTES);
            const durationMs = mov.initialEnd.getTime() - mov.initialStart.getTime();
            let newEnd = new Date(newStart.getTime() + durationMs);
            const dayEnd = endOfDay(pos.day);
            if (newEnd > dayEnd) {
              newEnd = new Date(dayEnd);
              const start = new Date(newEnd.getTime() - durationMs);
              setMovePreview({ event: mov.event, startTime: start, endTime: newEnd });
              setDragClone((prev) =>
                prev
                  ? {
                      ...prev,
                      x: e.clientX - mov.cloneOffsetX,
                      y: e.clientY - mov.cloneOffsetY,
                      previewStartTime: start,
                      previewEndTime: newEnd,
                    }
                  : null
              );
            } else {
              setMovePreview({ event: mov.event, startTime: newStart, endTime: newEnd });
              setDragClone((prev) =>
                prev
                  ? {
                      ...prev,
                      x: e.clientX - mov.cloneOffsetX,
                      y: e.clientY - mov.cloneOffsetY,
                      previewStartTime: newStart,
                      previewEndTime: newEnd,
                    }
                  : null
              );
            }
          } else {
            setDragClone((prev) =>
              prev
                ? {
                    ...prev,
                    x: e.clientX - mov.cloneOffsetX,
                    y: e.clientY - mov.cloneOffsetY,
                  }
                : null
            );
          }
        }
      }
    },
    [getColumnAndLocalY]
  );

  const resizePreviewRef = useRef<ResizePreview | null>(null);
  const movePreviewRef = useRef<MovePreview | null>(null);
  resizePreviewRef.current = resizePreview;
  movePreviewRef.current = movePreview;

  const handleGridPointerUpStable = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const grid = gridInnerRef.current;
      if (grid) grid.releasePointerCapture(e.pointerId);
      const res = resizeRef.current;
      const mov = moveRef.current;
      const resPreview = resizePreviewRef.current;
      const movPreview = movePreviewRef.current;
      resizeRef.current = null;
      moveRef.current = null;
      setResizePreview(null);
      setMovePreview(null);
      setDragClone(null);
      if (res && onEventResize && resPreview) {
        onEventResize(resPreview.event, resPreview.startTime, resPreview.endTime);
      } else if (res && res.eventElement) {
        const rect = (res.eventElement.firstElementChild as HTMLElement)?.getBoundingClientRect?.() ?? res.eventElement.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          onEventClick(res.event, rect);
        }
      } else if (mov) {
        const sameSlot =
          movPreview &&
          mov.initialStart.getTime() === movPreview.startTime.getTime() &&
          mov.initialEnd.getTime() === movPreview.endTime.getTime();
        if (mov.isDrag && movPreview && onEventMove && !sameSlot) {
          onEventMove(movPreview.event, movPreview.startTime, movPreview.endTime);
        } else if ((!mov.isDrag || sameSlot) && mov.eventElement) {
          const rect = (mov.eventElement.firstElementChild as HTMLElement)?.getBoundingClientRect?.() ?? mov.eventElement.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            onEventClick(mov.event, rect);
          }
        }
      }
    },
    [onEventResize, onEventMove, onEventClick]
  );

  const handleGridPointerCancel = useCallback(() => {
    resizeRef.current = null;
    moveRef.current = null;
    setResizePreview(null);
    setMovePreview(null);
    setDragClone(null);
  }, []);

  function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
      <div
        ref={gridInnerRef}
        className="flex relative"
        style={{ height: `${HOUR_HEIGHT * 24}px` }}
        onPointerMove={handleGridPointerMove}
        onPointerUp={handleGridPointerUpStable}
        onPointerCancel={handleGridPointerCancel}
      >
        {/* Time labels */}
        <div className="w-14 shrink-0 relative select-none">
          {HOURS.map((hour) => (
        <div
            key={hour}
            className="absolute right-2 text-xs text-gray-400 dark:text-gray-600 leading-none"
            style={{ top: `${hour * HOUR_HEIGHT - 7}px` }}
          >
              {hourLabel(hour)}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {weekDays.map((day) => {
          const today = isToday(day);
          let dayEvents = events.filter((ev) =>
            isSameDay(new Date(ev.startTime), day)
          );
          if (movePreview && !dragClone) {
            const origDay = new Date(movePreview.event.startTime);
            if (isSameDay(origDay, day)) {
              dayEvents = dayEvents.filter(
                (ev) =>
                  ev.originalId !== movePreview.event.originalId ||
                  ev.startTime !== movePreview.event.startTime
              );
            }
            if (isSameDay(movePreview.startTime, day)) {
              dayEvents = [
                ...dayEvents,
                {
                  ...movePreview.event,
                  startTime: movePreview.startTime.toISOString(),
                  endTime: movePreview.endTime.toISOString(),
                },
              ];
            }
          }
          if (movePreview && dragClone) {
            const origDay = new Date(movePreview.event.startTime);
            if (isSameDay(origDay, day)) {
              dayEvents = dayEvents.filter(
                (ev) =>
                  ev.originalId !== movePreview.event.originalId ||
                  ev.startTime !== movePreview.event.startTime
              );
            }
          }
          const laid = layoutEvents(dayEvents);

          const showCreatePreview =
            createPreview &&
            createPreview.day.getTime() === day.getTime();

          return (
            <div
              key={day.toISOString()}
              className="flex-1 border-l border-gray-200 dark:border-gray-700 relative cursor-pointer"
              onPointerDown={(e) => handleColumnPointerDown(e, day)}
              onPointerMove={(e) => handleColumnPointerMove(e, day)}
              onPointerUp={(e) => handleColumnPointerUp(e, day)}
              onPointerCancel={(e) => handleColumnPointerCancel(e)}
            >
              {/* Hour grid lines */}
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 border-t border-gray-100 dark:border-gray-800"
                  style={{ top: `${hour * HOUR_HEIGHT}px` }}
                />
              ))}

              {/* Half-hour lines */}
              {HOURS.map((hour) => (
                <div
                  key={`h-${hour}`}
                  className="absolute left-0 right-0 border-t border-gray-50 dark:border-gray-800/50"
                  style={{
                    top: `${hour * HOUR_HEIGHT + HOUR_HEIGHT / 2}px`,
                  }}
                />
              ))}

              {/* Event blocks */}
              {laid.map(({ event, column, totalColumns }) => {
                const isResizing =
                  resizePreview &&
                  resizePreview.event.originalId === event.originalId &&
                  resizePreview.event.startTime === event.startTime;
                return (
                  <div
                    key={`${event.originalId}-${event.startTime}`}
                    data-event
                    onPointerDown={(e) =>
                      handleEventWrapperPointerDown(e, event, day)
                    }
                  >
                    <EventBlock
                      event={event}
                      dayStart={day}
                      columnIndex={column}
                      totalColumns={totalColumns}
                      onClick={onEventClick}
                      overrideStart={
                        isResizing ? resizePreview!.startTime : undefined
                      }
                      overrideEnd={
                        isResizing ? resizePreview!.endTime : undefined
                      }
                    />
                  </div>
                );
              })}

              {/* Drag-to-create preview */}
              {showCreatePreview && (() => {
                const dayStart = startOfDay(day).getTime();
                const topPx = ((createPreview!.startDate.getTime() - dayStart) / 60000 / 60) * HOUR_HEIGHT;
                const heightPx = Math.max(20, ((createPreview!.endDate.getTime() - createPreview!.startDate.getTime()) / 60000 / 60) * HOUR_HEIGHT);
                return (
                  <div
                    className="absolute left-1 right-1 rounded-md pointer-events-none z-30 border-2 border-dashed border-blue-400 bg-blue-400/20"
                    style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                  />
                );
              })()}

              {/* Current time indicator (today only) */}
              {today && currentTimeTop !== null && (
                <div
                  className="absolute left-0 right-0 z-20 pointer-events-none"
                  style={{ top: `${currentTimeTop}px` }}
                >
                  <div className="flex items-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 -ml-1.5" />
                    <div className="flex-1 h-px bg-red-500" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      </div>
      {typeof document !== "undefined" &&
        dragClone &&
        createPortal(
          <div
            className="fixed pointer-events-none z-50 rounded-md shadow-lg px-1.5 py-0.5 overflow-hidden border-l-4 flex flex-col justify-start"
            style={{
              left: dragClone.x,
              top: dragClone.y,
              width: dragClone.width,
              height: dragClone.height,
              backgroundColor: (() => {
                const rgb = hexToRgb(dragClone.event.color);
                return rgb
                  ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`
                  : `${dragClone.event.color}80`;
              })(),
              borderLeftColor: dragClone.event.color,
            }}
          >
            <p
              className="text-xs font-semibold leading-tight truncate"
              style={{ color: dragClone.event.color }}
            >
              {dragClone.event.title}
            </p>
            <p
              className="text-xs leading-tight truncate opacity-90"
              style={{ color: dragClone.event.color }}
            >
              {format(dragClone.previewStartTime, "EEE, h:mm a")} – {format(dragClone.previewEndTime, "h:mm a")}
            </p>
          </div>,
          document.body
        )}
    </div>
  );
}
