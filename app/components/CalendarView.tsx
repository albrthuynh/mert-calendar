"use client";

import { useState } from "react";
import { WeekView } from "./WeekView";
import { MonthView } from "./MonthView";
import { type ViewMode } from "./ViewToggle";

export function CalendarView() {
  const [view, setView] = useState<ViewMode>("week");

  if (view === "month") {
    return <MonthView onViewChange={setView} />;
  }

  return <WeekView onViewChange={setView} />;
}
