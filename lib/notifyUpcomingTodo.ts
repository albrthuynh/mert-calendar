import type { Todo } from "@/types/calendar";
import type { NotificationPreferences } from "@/app/context/NotificationPreferencesContext";
import { normalizeSoundId, playNotificationSound } from "@/lib/notificationSound";

export async function notifyUpcomingTodo(opts: {
  todo: Todo;
  prefs: NotificationPreferences;
  pushToast: (t: { id?: string; title: string; message?: string }) => void;
}) {
  const { todo, prefs, pushToast } = opts;

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

  let showedBrowser = false;
  if (typeof window !== "undefined") {
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        const tag = `mert-calendar-todo-${todo.id}-${todo.dueDate ?? todo.taskDate}`;
        new Notification(title, {
          body: toastMessage,
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

    const alertMessage = `${title}\n\n${toastMessage}`;
    window.alert(alertMessage);
  }

  // Always show a lightweight in-app signal so it feels reliable.
  pushToast({
    id: `todo-reminder-${todo.id}-${todo.dueDate ?? todo.taskDate}`,
    title: showedBrowser ? `Todo: ${title}` : `Todo reminder: ${title}`,
    message: toastMessage,
  });
}

