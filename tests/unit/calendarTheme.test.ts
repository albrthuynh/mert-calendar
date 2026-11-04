import { getCalendarColorTheme } from "@/lib/calendarTheme";

describe("calendar theme contrast", () => {
  it.each(["#000000", "#111827", "#0000ff", "#800000"])("uses light text for dark calendar color %s", (color) => {
    expect(getCalendarColorTheme(color)).toEqual({ dark: true, foreground: "#ffffff" });
  });

  it.each(["#ffffff", "#ffff00", "#ff00bb", "#00ff00"])("uses dark text for light calendar color %s", (color) => {
    expect(getCalendarColorTheme(color)).toEqual({ dark: false, foreground: "#000000" });
  });
});
