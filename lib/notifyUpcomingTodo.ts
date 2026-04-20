import type { Todo } from "@/types/calendar";
import type { NotificationPreferences } from "@/app/context/NotificationPreferencesContext";
import { normalizeSoundId, playNotificationSound } from "@/lib/notificationSound";

export async function notifyUpcomingTodo(opts: {
  todo: Todo;
  prefs: NotificationPreferences;
}) {
  const { todo, prefs } = opts;

  const title = todo.title?.trim() ? todo.title.trim() : "Upcoming task";

  let timeLabel = "";
  if (todo.dueDate) {
    const due = new Date(todo.dueDate);
    if (!isNaN(due.getTime())) {
      timeLabel = due.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
  }

  const toastMessage = timeLabel
    ? `Due at ${timeLabel}`
    : "Task due soon.";

  if (typeof window !== "undefined") {
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        const tag = `mert-calendar-todo-${todo.id}-${todo.dueDate ?? todo.taskDate}`;
        const notification = new Notification(title, {
          body: toastMessage,
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
