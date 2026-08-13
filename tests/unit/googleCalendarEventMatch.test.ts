import { chooseExistingGoogleEvent } from "@/lib/googleCalendar";

type EventCandidate = {
  id: string;
};

describe("Google Calendar event reconciliation", () => {
  const googleEventMatch: EventCandidate = { id: "google-event" };
  const recurringInstanceMatch: EventCandidate = { id: "existing-instance" };
  const linkedLocalEvent: EventCandidate = { id: "linked-local-event" };

  it("reuses an existing recurring occurrence matched by instanceId", () => {
    expect(
      chooseExistingGoogleEvent({
        existingByGoogleId: null,
        existingByInstanceId: recurringInstanceMatch,
        linkedLocalEvent: null,
        isRecurringInstance: true,
      })
    ).toBe(recurringInstanceMatch);
  });

  it("does not reconcile a recurring occurrence against its linked series master", () => {
    expect(
      chooseExistingGoogleEvent({
        existingByGoogleId: null,
        existingByInstanceId: null,
        linkedLocalEvent,
        isRecurringInstance: true,
      })
    ).toBeNull();
  });

  it("keeps Google event IDs authoritative when an exact match exists", () => {
    expect(
      chooseExistingGoogleEvent({
        existingByGoogleId: googleEventMatch,
        existingByInstanceId: recurringInstanceMatch,
        linkedLocalEvent,
        isRecurringInstance: true,
      })
    ).toBe(googleEventMatch);
  });

  it("still reconciles non-recurring events through their local link", () => {
    expect(
      chooseExistingGoogleEvent({
        existingByGoogleId: null,
        existingByInstanceId: null,
        linkedLocalEvent,
        isRecurringInstance: false,
      })
    ).toBe(linkedLocalEvent);
  });
});
