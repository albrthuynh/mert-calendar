"use client";

import { useEffect, useMemo, useState } from "react";
import { playNotificationSound, normalizeSoundId } from "@/lib/notificationSound";
import type { NotificationPreferences } from "../context/NotificationPreferencesContext";

const REMINDER_OPTIONS_MINUTES = [0, 5, 10, 15, 30, 60] as const;
const SOUND_OPTIONS = [
  { id: "beep", label: "Beep" },
  { id: "chime", label: "Chime" },
] as const;

type Props = {
  initial: NotificationPreferences;
  onSave: (prefs: NotificationPreferences) => Promise<void> | void;
  onClose: () => void;
};

export function NotificationSettingsModal({ initial, onSave, onClose }: Props) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    initial.notificationsEnabled
  );
  const [defaultReminderMinutes, setDefaultReminderMinutes] = useState(
    initial.defaultReminderMinutes
  );
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(
    initial.notificationSoundEnabled
  );
  const [notificationSound, setNotificationSound] = useState<string | null>(
    initial.notificationSound ?? "beep"
  );
  const [notificationVolume, setNotificationVolume] = useState(
    initial.notificationVolume
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported"
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    setPermission(Notification.permission);
  }, []);

  const canRequestPermission = permission === "default";
  const isDenied = permission === "denied";

  const effectiveSoundId = useMemo(
    () => normalizeSoundId(notificationSound),
    [notificationSound]
  );

  const handleRequestPermission = async () => {
    setError(null);
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to request permission");
    }
  };

  const handleTestSound = async () => {
    setError(null);
    try {
      await playNotificationSound({
        sound: effectiveSoundId,
        volume: notificationVolume,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to play sound");
    }
  };

  const handleTestNotification = async () => {
    setError(null);
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setPermission("unsupported");
      setError("This browser does not support notifications.");
      return;
    }
    if (Notification.permission !== "granted") {
      setError("Please allow notifications first.");
      return;
    }
    try {
      new Notification("Test reminder", {
        body: "This is how event reminders will appear.",
      });
      if (notificationSoundEnabled) {
        await playNotificationSound({
          sound: effectiveSoundId,
          volume: notificationVolume,
        });
      }
      window.alert(
        "Test reminder\n\nThis is how event reminders will appear."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to show notification");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const next: NotificationPreferences = {
        notificationsEnabled,
        defaultReminderMinutes,
        notificationSoundEnabled,
        notificationSound: notificationSound?.trim()
          ? notificationSound.trim()
          : null,
        notificationVolume,
      };
      await onSave(next);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Notifications
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Reminders fire while this app is open in a tab.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-2 py-1 rounded-md text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Close
            </button>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
              Browser permission
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Status:{" "}
              <span className="font-medium text-gray-700 dark:text-gray-200">
                {permission}
              </span>
            </p>
            {permission === "unsupported" && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Your browser doesn’t support the Notifications API.
              </p>
            )}
            {canRequestPermission && (
              <button
                type="button"
                onClick={handleRequestPermission}
                className="mt-2 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700"
              >
                Allow notifications
              </button>
            )}
            {isDenied && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                Notifications are blocked. Enable them in your browser site
                settings.
              </p>
            )}
          </div>

          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-800 dark:text-gray-200">
              Enable reminders
            </span>
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={(e) => setNotificationsEnabled(e.target.checked)}
              className="w-4 h-4"
            />
          </label>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Default reminder
            </label>
            <select
              value={defaultReminderMinutes}
              onChange={(e) =>
                setDefaultReminderMinutes(Number(e.target.value))
              }
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 px-2.5 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {REMINDER_OPTIONS_MINUTES.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? "At start time" : `${m} minutes before`}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-800 dark:text-gray-200">
                Sound
              </span>
              <input
                type="checkbox"
                checked={notificationSoundEnabled}
                onChange={(e) => setNotificationSoundEnabled(e.target.checked)}
                className="w-4 h-4"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Sound type
                </label>
                <select
                  value={effectiveSoundId}
                  onChange={(e) => setNotificationSound(e.target.value)}
                  disabled={!notificationSoundEnabled}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 px-2.5 py-1.5 text-sm text-gray-900 dark:text-gray-100 disabled:opacity-60"
                >
                  {SOUND_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Volume
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={notificationVolume}
                  disabled={!notificationSoundEnabled}
                  onChange={(e) =>
                    setNotificationVolume(Number(e.target.value))
                  }
                  className="w-full disabled:opacity-60"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleTestSound}
                disabled={!notificationSoundEnabled}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60"
              >
                Test sound
              </button>
              <button
                type="button"
                onClick={handleTestNotification}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Test notification
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

