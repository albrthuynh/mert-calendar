"use client";

import { useEffect, useState } from "react";
import { WeekView } from "./WeekView";
import { MonthView } from "./MonthView";
import { MobileDayView } from "./MobileDayView";
import { type ViewMode } from "./ViewToggle";
import { useCalendarPreferences } from "../context/CalendarPreferencesContext";

const DESKTOP_QUERY = "(min-width: 768px)";

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_QUERY);
    const handleChange = () => setIsDesktop(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isDesktop;
}

export function CalendarView() {
  const [view, setView] = useState<ViewMode>("week");
  const { backgroundUrl } = useCalendarPreferences();
  const isDesktop = useIsDesktop();

  if (isDesktop === null) {
    return <div className="flex-1 min-h-0 min-w-0 bg-white dark:bg-gray-900" />;
  }

  return (
    <div className="flex-1 flex min-h-0 min-w-0">
      {isDesktop ? (
        view === "month" ? (
          <MonthView
            onViewChange={setView}
            backgroundUrl={backgroundUrl ?? undefined}
          />
        ) : (
          <WeekView
            onViewChange={setView}
            backgroundUrl={backgroundUrl ?? undefined}
          />
        )
      ) : (
        <MobileDayView backgroundUrl={backgroundUrl ?? undefined} />
      )}
    </div>
  );
}
