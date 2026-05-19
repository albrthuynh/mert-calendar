import { CalendarEvent } from "@/types/calendar";

export type EventDeleteScope = "single" | "series";

export function getEventInstanceStartTime(event: CalendarEvent): string {
  return event.instanceStartTime ?? event.startTime;
}

export function buildEventDeleteRequest(
  event: CalendarEvent,
  scope: EventDeleteScope = "single"
): RequestInit {
  if (event.isRecurringInstance && event.recurrenceRule && scope === "single") {
    return {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        editScope: "single",
        instanceStartTime: getEventInstanceStartTime(event),
      }),
    };
  }

  return { method: "DELETE" };
}

export function removeDeletedEventFromList(
  events: CalendarEvent[],
  deletedEvent: CalendarEvent,
  scope: EventDeleteScope = "single"
): CalendarEvent[] {
  if (
    deletedEvent.isRecurringInstance &&
    deletedEvent.recurrenceRule &&
    scope === "single"
  ) {
    const deletedInstanceStart = getEventInstanceStartTime(deletedEvent);
    return events.filter((event) => {
      if (event.originalId !== deletedEvent.originalId) return true;
      if (!event.isRecurringInstance) return true;
      return getEventInstanceStartTime(event) !== deletedInstanceStart;
    });
  }

  return events.filter((event) => event.originalId !== deletedEvent.originalId);
}
