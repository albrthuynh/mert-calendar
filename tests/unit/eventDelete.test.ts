import {
  buildEventDeleteRequest,
  removeDeletedEventFromList,
} from "@/lib/eventDelete";
import type { CalendarEvent } from "@/types/calendar";

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-1",
    title: "Class",
    description: null,
    link: null,
    startTime: "2025-11-05T14:30:00.000Z",
    endTime: "2025-11-05T16:20:00.000Z",
    color: "#4285F4",
    allDay: false,
    recurrenceRule: null,
    recurrenceEndDate: null,
    reminderMinutes: null,
    reminderDisabled: false,
    isRecurringInstance: false,
    originalId: "event-1",
    instanceStartTime: null,
    ...overrides,
  };
}

describe("event deletion helpers", () => {
  it("builds single-occurrence delete requests for recurring instances", () => {
    const request = buildEventDeleteRequest(
      event({
        recurrenceRule: "FREQ=WEEKLY",
        isRecurringInstance: true,
        originalId: "series-1",
        instanceStartTime: "2025-11-05T14:30:00.000Z",
      })
    );

    expect(request.method).toBe("DELETE");
    expect(JSON.parse(String(request.body))).toEqual({
      editScope: "single",
      instanceStartTime: "2025-11-05T14:30:00.000Z",
    });
  });

  it("removes only the selected recurring occurrence for single deletes", () => {
    const selected = event({
      id: "selected",
      originalId: "series-1",
      recurrenceRule: "FREQ=WEEKLY",
      isRecurringInstance: true,
      instanceStartTime: "2025-11-05T14:30:00.000Z",
    });
    const nextOccurrence = event({
      id: "next",
      originalId: "series-1",
      recurrenceRule: "FREQ=WEEKLY",
      isRecurringInstance: true,
      startTime: "2025-11-12T14:30:00.000Z",
      instanceStartTime: "2025-11-12T14:30:00.000Z",
    });

    expect(removeDeletedEventFromList([selected, nextOccurrence], selected)).toEqual([
      nextOccurrence,
    ]);
  });
});
