import type { CalendarEvent } from "@/types/calendar";
import type { NotificationPreferences } from "@/app/context/NotificationPreferencesContext";
import { normalizeSoundId, playNotificationSound } from "@/lib/notificationSound";

export async function notifyUpcomingEvent(opts: {
  event: CalendarEvent;
  prefs: NotificationPreferences;
}) {
  const { event, prefs } = opts;

  const title = event.title?.trim() ? event.title.trim() : "Upcoming event";
  const start = new Date(event.startTime);
  const timeLabel = isNaN(start.getTime())
    ? ""
    : start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const toastMessage = timeLabel ? `Starts at ${timeLabel}` : undefined;

  if (typeof window !== "undefined") {
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        const tag = `mert-calendar-${event.originalId}-${event.startTime}`;
        const notification = new Notification(title, {
          body: toastMessage ?? "Event starting soon.",
          tag,
          requireInteraction: false,
        });
        window.setTimeout(() => notification.close(), 12_000);
      } catch {
        // ignore notification errors
      }
    }

    if (prefs.notificationSoundEnabled) {
      await playNotificationSound({
        sound: normalizeSoundId(prefs.notificationSound),
        volume: prefs.notificationVolume,
      });
    }

  }
}
