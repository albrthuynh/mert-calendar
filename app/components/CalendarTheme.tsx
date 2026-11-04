"use client";

import { useEffect } from "react";
import { useCalendarPreferences } from "../context/CalendarPreferencesContext";
import { getCalendarColorTheme } from "@/lib/calendarTheme";

export function CalendarTheme() {
  const { calendarColor } = useCalendarPreferences();

  useEffect(() => {
    if (!calendarColor) return;
    const themeRoot = document.documentElement;
    const { dark } = getCalendarColorTheme(calendarColor);
    // Theme the document so dialogs rendered through portals inherit the same palette.
    themeRoot.dataset.calendarTone = dark ? "dark" : "light";
    themeRoot.style.setProperty("--calendar-custom-color", calendarColor);
    return () => {
      delete themeRoot.dataset.calendarTone;
      themeRoot.style.removeProperty("--calendar-custom-color");
    };
  }, [calendarColor]);

  return null;
}
