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
  if (typeof window !== "undefined") {
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        const tag = `mert-calendar-${event.originalId}-${event.startTime}`;
        new Notification(title, {
          body: toastMessage ?? "Event starting soon.",
          tag,
        });
        showedBrowser = true;
      } catch {
        // fall back to toast/alert
      }
    }

    if (prefs.notificationSoundEnabled) {
      await playNotificationSound({
        sound: normalizeSoundId(prefs.notificationSound),
        volume: prefs.notificationVolume,
      });
    }

    const alertMessage = toastMessage
      ? `${title}\n\n${toastMessage}`
      : `${title}\n\nEvent starting soon.`;
    window.alert(alertMessage);
  }

  // Always show a lightweight in-app signal so it feels reliable.
  pushToast({
    id: `reminder-${event.originalId}-${event.startTime}`,
    title: showedBrowser ? `Reminder: ${title}` : `Event reminder: ${title}`,
    message: toastMessage,
  });
}

