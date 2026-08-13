import { getEventsForDay } from "@/lib/calendarEventGrouping";
import { type CalendarEvent } from "@/types/calendar";

function createEvent(
  id: string,
  startTime: Date,
  endTime: Date
): CalendarEvent {
  return {
    id,
    originalId: id,
    title: id,
    description: null,
    link: null,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    color: "#4285F4",
    allDay: false,
    recurrenceRule: null,
    recurrenceEndDate: null,
    reminderMinutes: null,
    reminderDisabled: false,
    isRecurringInstance: false,
  };
}

describe("calendar event day grouping", () => {
  const monday = new Date(2026, 7, 10);

  it("includes events spanning across the entire day", () => {
    const spanningEvent = createEvent(
      "conference",
      new Date(2026, 7, 9, 18),
      new Date(2026, 7, 11, 9)
    );

    expect(getEventsForDay([spanningEvent], monday)).toEqual([spanningEvent]);
  });

  it("does not include an event whose exclusive end is midnight", () => {
    const sundayEvent = createEvent(
      "sunday",
      new Date(2026, 7, 9, 20),
      new Date(2026, 7, 10)
    );

    expect(getEventsForDay([sundayEvent], monday)).toEqual([]);
  });

  it("sorts the day's events by start time", () => {
    const afternoonEvent = createEvent(
      "afternoon",
      new Date(2026, 7, 10, 14),
      new Date(2026, 7, 10, 15)
    );
    const morningEvent = createEvent(
      "morning",
      new Date(2026, 7, 10, 9),
      new Date(2026, 7, 10, 10)
    );

    expect(getEventsForDay([afternoonEvent, morningEvent], monday)).toEqual([
      morningEvent,
      afternoonEvent,
    ]);
  });
});
