import { normalizeCalendarColor, normalizeCalendarImageUrl } from "@/lib/calendarAppearance";

describe("calendar appearance validation", () => {
  it("preserves omitted preferences and allows clearing overrides", () => {
    expect(normalizeCalendarColor(undefined)).toBeUndefined();
    expect(normalizeCalendarColor(null)).toBeNull();
    expect(normalizeCalendarImageUrl(undefined)).toBeUndefined();
    expect(normalizeCalendarImageUrl(null)).toBeNull();
    expect(normalizeCalendarImageUrl("  ")).toBeNull();
  });

  it("normalizes hex colors and rejects CSS injection", () => {
    expect(normalizeCalendarColor("#A1B2C3")).toBe("#a1b2c3");
    for (const invalidColor of ["red", "#abc", "#123456; background: url(https://example.com)", 123, {}]) {
      expect(() => normalizeCalendarColor(invalidColor)).toThrow();
    }
  });

  it("accepts web images and rejects unsafe protocols, credentials, and oversized URLs", () => {
    expect(normalizeCalendarImageUrl(" https://example.com/photo.jpg ")).toBe("https://example.com/photo.jpg");
    for (const invalidUrl of ["javascript:alert(1)", "data:image/svg+xml,test", "file:///etc/passwd", "https://user:password@example.com", "invalid", 123, `https://example.com/${"a".repeat(2048)}`]) {
      expect(() => normalizeCalendarImageUrl(invalidUrl)).toThrow();
    }
  });
});
