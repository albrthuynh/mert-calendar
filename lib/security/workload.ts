export class CalendarWorkloadError extends Error {
  constructor() {
    super("Too many events in this range. Choose a smaller date range or reduce recurring events.");
  }
}

export const MAX_SOURCE_EVENTS = 2000;
export const MAX_OVERRIDE_EVENTS = 10000;
export const MAX_EXPANDED_EVENTS = 10000;

export class CalendarResponseBudget {
  private eventCount = 0;
  private serializedBytes = 2;

  consume(events: unknown[]) {
    for (const event of events) {
      this.eventCount++;
      this.serializedBytes += Buffer.byteLength(JSON.stringify(event), "utf8") + 1;
      if (this.eventCount > MAX_EXPANDED_EVENTS || this.serializedBytes > 4 * 1024 * 1024) {
        throw new CalendarWorkloadError();
      }
    }
  }
}
