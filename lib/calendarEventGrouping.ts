import { endOfDay, startOfDay } from "date-fns";
import { type CalendarEvent } from "@/types/calendar";

export function getEventsForDay(
  events: CalendarEvent[],
  day: Date
): CalendarEvent[] {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);

  return events
    .filter((event) => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      return eventStart <= dayEnd && eventEnd > dayStart;
    })
    .sort(
      (firstEvent, secondEvent) =>
        new Date(firstEvent.startTime).getTime() -
        new Date(secondEvent.startTime).getTime()
    );
}
