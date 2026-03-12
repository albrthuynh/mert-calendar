import type { CalendarEvent } from "@/types/calendar";
import type { NotificationPreferences } from "@/app/context/NotificationPreferencesContext";
import { normalizeSoundId, playNotificationSound } from "@/lib/notificationSound";

export async function notifyUpcomingEvent(opts: {
  event: CalendarEvent;
  prefs: NotificationPreferences;
  pushToast: (t: { id?: string; title: string; message?: string }) => void;
}) {
  const { event, prefs, pushToast } = opts;

  const title = event.title?.trim() ? event.title.trim() : "Upcoming event";
  const start = new Date(event.startTime);
  const timeLabel = isNaN(start.getTime())
    ? ""
    : start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const toastMessage = timeLabel ? `Starts at ${timeLabel}` : undefined;

  let showedBrowser = false;
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "granted") {
      try {
        const tag = `mert-calendar-${event.originalId}-${event.startTime}`;
        new Notification(title, {
          body: toastMessage ?? "Event starting soon.",
          tag,
        });
        showedBrowser = true;
      } catch {
        // fall back to toast
      }
    }
  }

  // Always show a lightweight in-app signal so it feels reliable.
  pushToast({
    id: `reminder-${event.originalId}-${event.startTime}`,
    title: showedBrowser ? `Reminder: ${title}` : `Event reminder: ${title}`,
    message: toastMessage,
  });

  if (prefs.notificationSoundEnabled) {
    await playNotificationSound({
      sound: normalizeSoundId(prefs.notificationSound),
      volume: prefs.notificationVolume,
    });
  }
}

