import { buildEventsUrl, getBrowserTimeZone } from "@/lib/eventFetchUrl";

describe("event fetch URL helpers", () => {
  it("includes the browser time zone with the event range", () => {
    const url = buildEventsUrl(
      "2025-11-01T05:00:00.000Z",
      "2025-11-30T05:59:59.999Z"
    );
    const parsed = new URL(url, "https://calendar.test");

    expect(parsed.pathname).toBe("/api/events");
    expect(parsed.searchParams.get("start")).toBe("2025-11-01T05:00:00.000Z");
    expect(parsed.searchParams.get("end")).toBe("2025-11-30T05:59:59.999Z");
    expect(parsed.searchParams.get("timeZone")).toBe(getBrowserTimeZone());
  });
});
