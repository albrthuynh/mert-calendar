"use client";

import { useEffect, useMemo, useState } from "react";
import { playNotificationSound, normalizeSoundId } from "@/lib/notificationSound";
import type { NotificationPreferences } from "../context/NotificationPreferencesContext";
import { Copy, Check } from "lucide-react";

const REMINDER_OPTIONS_MINUTES = [0, 5, 10, 15, 30, 60] as const;
const SOUND_OPTIONS = [
  { id: "beep", label: "Beep" },
  { id: "chime", label: "Chime" },
  { id: "doorbell", label: "Doorbell" },
  { id: "pokemon", label: "Pokemon" },
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
  const [subscriptionToken, setSubscriptionToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    setPermission(Notification.permission);
  }, []);

  // Fetch subscription token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const res = await fetch("/api/user/notification-settings");
        if (res.ok) {
          const data = await res.json();
          setSubscriptionToken(data.calendarSubscriptionToken || null);
        }
      } catch (err) {
        console.error("Failed to fetch subscription token:", err);
      } finally {
        setLoadingToken(false);
      }
    };
    fetchToken();
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

  const subscriptionUrl = subscriptionToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/calendar/subscribe/${subscriptionToken}`
    : null;

  const handleCopyUrl = async () => {
    if (!subscriptionUrl) return;
    try {
      await navigator.clipboard.writeText(subscriptionUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError("Failed to copy to clipboard");
    }
  };

  const handleRegenerateToken = async () => {
    if (!confirm("Regenerate subscription URL? Your old URL will stop working.")) {
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/user/regenerate-calendar-token", {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Failed to regenerate token");
      }
      const data = await res.json();
      setSubscriptionToken(data.calendarSubscriptionToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate token");
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

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
                Calendar Subscription (iOS/Android)
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Subscribe in Apple Calendar or Google Calendar for native notifications
              </p>
            </div>
            
            {loadingToken ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">Loading...</p>
            ) : subscriptionUrl ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={subscriptionUrl}
                    className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-950 px-2.5 py-1.5 text-xs text-gray-900 dark:text-gray-100 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-1.5"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <p className="font-medium text-gray-700 dark:text-gray-200">How to subscribe:</p>
                  <p><strong>iOS:</strong> Settings → Calendar → Accounts → Add Account → Other → Subscribe to Calendar → Paste URL</p>
                  <p><strong>Android/Google:</strong> Google Calendar → Settings → Add calendar → From URL → Paste URL</p>
                  <p className="text-amber-600 dark:text-amber-400 mt-2">
                    Updates hourly. Keep this URL private - anyone with it can view your calendar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRegenerateToken}
                  className="mt-2 px-3 py-1.5 rounded-md text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Regenerate URL
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                No subscription URL available
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

