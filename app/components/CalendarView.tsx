"use client";

import { useState } from "react";
import { WeekView } from "./WeekView";
import { MonthView } from "./MonthView";
import { type ViewMode } from "./ViewToggle";
import { useCalendarPreferences } from "../context/CalendarPreferencesContext";

export function CalendarView() {
  const [view, setView] = useState<ViewMode>("week");
  const { backgroundUrl } = useCalendarPreferences();

  if (view === "month") {
    return (
      <MonthView
        onViewChange={setView}
        backgroundUrl={backgroundUrl ?? undefined}
      />
    );
  }

  return (
    <WeekView
      onViewChange={setView}
      backgroundUrl={backgroundUrl ?? undefined}
    />
  );
}
