import { normalizeEventLink } from "@/lib/eventLink";

describe("event link normalization", () => {
  it("adds https to bare domains", () => {
    expect(normalizeEventLink("example.com/class")).toBe(
      "https://example.com/class"
    );
  });

  it("rejects unsupported protocols", () => {
    expect(() => normalizeEventLink("javascript:alert(1)")).toThrow(
      "link must start with http:// or https://"
    );
  });
});
