"use client";

import { useState } from "react";
import { WeekView } from "./WeekView";
import { MonthView } from "./MonthView";
import { MobileDayView } from "./MobileDayView";
import { type ViewMode } from "./ViewToggle";
import { useCalendarPreferences } from "../context/CalendarPreferencesContext";

export function CalendarView() {
  const [view, setView] = useState<ViewMode>("week");
  const { backgroundUrl } = useCalendarPreferences();

  return (
    <div className="flex-1 flex min-h-0">
      {/* Desktop / tablet calendar */}
      <div className="hidden md:flex flex-1 min-h-0">
        {view === "month" ? (
          <MonthView
            onViewChange={setView}
            backgroundUrl={backgroundUrl ?? undefined}
          />
        ) : (
          <WeekView
            onViewChange={setView}
            backgroundUrl={backgroundUrl ?? undefined}
          />
        )}
      </div>

      {/* Mobile day view */}
      <div className="flex md:hidden flex-1 min-h-0">
        <MobileDayView backgroundUrl={backgroundUrl ?? undefined} />
      </div>
    </div>
  );
}
