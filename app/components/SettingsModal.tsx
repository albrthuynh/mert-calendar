"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { signIn, signOut } from "next-auth/react";
import {
  Bell,
  Check,
  Copy,
  Image as ImageIcon,
  LogOut,
  RefreshCw,
  User,
  X,
} from "lucide-react";
import { playNotificationSound, normalizeSoundId } from "@/lib/notificationSound";
import type { NotificationPreferences } from "../context/NotificationPreferencesContext";

const GOOGLE_CALENDAR_SCOPE =
  "openid email profile https://www.googleapis.com/auth/calendar.events";

const REMINDER_OPTIONS_MINUTES = [0, 5, 10, 15, 30, 60] as const;
const SOUND_OPTIONS = [
  { id: "beep", label: "Beep" },
  { id: "chime", label: "Chime" },
  { id: "doorbell", label: "Doorbell" },
  { id: "pokemon", label: "Pokemon" },
] as const;

type GoogleCalendarStatus = {
  connected: boolean;
  enabled: boolean;
  hasCalendarScope: boolean;
  lastSyncedAt: string | null;
  webhookConfigured: boolean;
  watchActive: boolean;
  watchExpiresAt: string | null;
};

type SettingsTab = "appearance" | "notifications" | "sync" | "account";

type AppearancePreferences = {
  backgroundUrl: string | null;
  topLeftUrl: string | null;
};

type SettingsModalProps = {
  user: { name?: string | null; image?: string | null } | null | undefined;
  initialAppearance: AppearancePreferences;
  initialNotifications: NotificationPreferences;
  onSaveAppearance: (prefs: AppearancePreferences) => Promise<void> | void;
  onSaveNotifications: (prefs: NotificationPreferences) => Promise<void> | void;
  onClose: () => void;
};

const tabs: Array<{
  id: SettingsTab;
  label: string;
  icon: typeof ImageIcon;
}> = [
  { id: "appearance", label: "Appearance", icon: ImageIcon },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "sync", label: "Sync", icon: RefreshCw },
  { id: "account", label: "Account", icon: User },
];

export function SettingsModal({
  user,
  initialAppearance,
  initialNotifications,
  onSaveAppearance,
  onSaveNotifications,
  onClose,
}: SettingsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");

  const [backgroundUrl, setBackgroundUrl] = useState(
    initialAppearance.backgroundUrl ?? ""
  );
  const [topLeftUrl, setTopLeftUrl] = useState(initialAppearance.topLeftUrl ?? "");
  const [appearanceSaving, setAppearanceSaving] = useState(false);
  const [appearanceError, setAppearanceError] = useState<string | null>(null);

  const [notificationsEnabled, setNotificationsEnabled] = useState(
    initialNotifications.notificationsEnabled
  );
  const [defaultReminderMinutes, setDefaultReminderMinutes] = useState(
    initialNotifications.defaultReminderMinutes
  );
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(
    initialNotifications.notificationSoundEnabled
  );
  const [notificationSound, setNotificationSound] = useState<string | null>(
    initialNotifications.notificationSound ?? "beep"
  );
  const [notificationVolume, setNotificationVolume] = useState(
    initialNotifications.notificationVolume
  );
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
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

  const [googleStatus, setGoogleStatus] = useState<GoogleCalendarStatus | null>(
    null
  );
  const [googleLoading, setGoogleLoading] = useState(true);
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    setPermission(Notification.permission);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchToken = async () => {
      try {
        const res = await fetch("/api/user/notification-settings");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setSubscriptionToken(data.calendarSubscriptionToken || null);
      } catch {
        if (!cancelled) setSubscriptionToken(null);
      } finally {
        if (!cancelled) setLoadingToken(false);
      }
    };

    fetchToken();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadGoogleStatus = async () => {
    setGoogleLoading(true);
    try {
      const res = await fetch("/api/google-calendar/status");
      setGoogleStatus(res.ok ? await res.json() : null);
    } catch {
      setGoogleStatus(null);
    } finally {
      setGoogleLoading(false);
    }
  };

  useEffect(() => {
    loadGoogleStatus();
  }, []);

  const effectiveSoundId = useMemo(
    () => normalizeSoundId(notificationSound),
    [notificationSound]
  );

  const canRequestPermission = permission === "default";
  const isDenied = permission === "denied";

  const googleNeedsConsent =
    !googleStatus?.connected || !googleStatus?.hasCalendarScope;
  const googleLabel = googleNeedsConsent
    ? "Connect Google Calendar"
    : googleSyncing
      ? "Syncing Google Calendar"
      : googleStatus?.enabled
        ? "Sync Google Calendar"
        : "Enable Google Calendar";
  const googleStateLabel = googleLoading
    ? "Checking status"
    : !googleStatus?.connected
      ? "Not connected"
      : !googleStatus.hasCalendarScope
        ? "Calendar access needed"
        : googleStatus.enabled && googleStatus.watchActive
          ? "Connected, instant sync on"
          : googleStatus.enabled && !googleStatus.webhookConfigured
            ? "Connected, webhook URL needed"
            : googleStatus.enabled && googleStatus.lastSyncedAt
              ? "Connected, pull sync on"
              : googleStatus.enabled
                ? "Connected, waiting for first sync"
                : "Connected, sync off";

  const subscriptionUrl = subscriptionToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/calendar/subscribe/${subscriptionToken}`
    : null;

  const handleAppearanceSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (appearanceSaving) return;

    setAppearanceSaving(true);
    setAppearanceError(null);
    try {
      await onSaveAppearance({
        backgroundUrl: backgroundUrl.trim() ? backgroundUrl.trim() : null,
        topLeftUrl: topLeftUrl.trim() ? topLeftUrl.trim() : null,
      });
    } catch (error) {
      setAppearanceError(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setAppearanceSaving(false);
    }
  };

  const handleNotificationSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (notificationSaving) return;

    setNotificationSaving(true);
    setNotificationError(null);
    try {
      await onSaveNotifications({
        notificationsEnabled,
        defaultReminderMinutes,
        notificationSoundEnabled,
        notificationSound: notificationSound?.trim()
          ? notificationSound.trim()
          : null,
        notificationVolume,
      });
    } catch (error) {
      setNotificationError(
        error instanceof Error ? error.message : "Failed to save"
      );
    } finally {
      setNotificationSaving(false);
    }
  };

  const handleRequestPermission = async () => {
    setNotificationError(null);
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }

    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
    } catch (error) {
      setNotificationError(
        error instanceof Error ? error.message : "Failed to request permission"
      );
    }
  };

  const handleTestSound = async () => {
    setNotificationError(null);
    try {
      await playNotificationSound({
        sound: effectiveSoundId,
        volume: notificationVolume,
      });
    } catch (error) {
      setNotificationError(
        error instanceof Error ? error.message : "Failed to play sound"
      );
    }
  };

  const handleTestNotification = async () => {
    setNotificationError(null);
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setPermission("unsupported");
      setNotificationError("This browser does not support notifications.");
      return;
    }
    if (Notification.permission !== "granted") {
      setNotificationError("Please allow notifications first.");
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
    } catch (error) {
      setNotificationError(
        error instanceof Error ? error.message : "Failed to show notification"
      );
    }
  };

  const handleCopyUrl = async () => {
    if (!subscriptionUrl) return;

    try {
      await navigator.clipboard.writeText(subscriptionUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotificationError("Failed to copy to clipboard");
    }
  };

  const handleRegenerateToken = async () => {
    if (!confirm("Regenerate subscription URL? Your old URL will stop working.")) {
      return;
    }

    setNotificationError(null);
    try {
      const res = await fetch("/api/user/regenerate-calendar-token", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to regenerate token");
      const data = await res.json();
      setSubscriptionToken(data.calendarSubscriptionToken);
    } catch (error) {
      setNotificationError(
        error instanceof Error ? error.message : "Failed to regenerate token"
      );
    }
  };

  const handleGoogleCalendarClick = async () => {
    setGoogleError(null);

    if (googleNeedsConsent) {
      await signIn(
        "google",
        { callbackUrl: "/calendar" },
        {
          access_type: "offline",
          prompt: "consent",
          scope: GOOGLE_CALENDAR_SCOPE,
        }
      );
      return;
    }

    setGoogleSyncing(true);
    try {
      const res = await fetch("/api/google-calendar/sync", { method: "POST" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Google Calendar sync failed.");
      }

      const payload = await res.json().catch(() => null);
      await loadGoogleStatus();
      if (payload?.watch?.error) setGoogleError(payload.watch.error);
      window.dispatchEvent(new Event("mert-calendar:events-updated"));
    } catch (error) {
      setGoogleError(
        error instanceof Error ? error.message : "Google Calendar sync failed."
      );
    } finally {
      setGoogleSyncing(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 px-3 py-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div
        className="flex h-full max-h-[720px] w-full max-w-4xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        onClick={(event) => event.stopPropagation()}
      >
        <aside className="hidden w-56 shrink-0 border-r border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-950/40 md:block">
          <div className="px-2 pb-3">
            <h2
              id="settings-title"
              className="text-sm font-semibold text-gray-900 dark:text-gray-100"
            >
              Settings
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Calendar, reminders, and sync.
            </p>
          </div>
          <nav className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors ${
                    selected
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <div className="md:hidden">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Settings
              </h2>
            </div>
            <div className="hidden min-w-0 md:block">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {tabs.find((tab) => tab.id === activeTab)?.label}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              aria-label="Close settings"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-1 overflow-x-auto border-b border-gray-200 px-3 py-2 dark:border-gray-700 md:hidden">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
                    selected
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                      : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {activeTab === "appearance" && (
              <form
                onSubmit={handleAppearanceSubmit}
                className="mx-auto max-w-2xl space-y-4"
              >
                <section className="space-y-1">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    Calendar appearance
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Customize the calendar background and header image.
                  </p>
                </section>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    Background image URL
                  </span>
                  <input
                    type="url"
                    value={backgroundUrl}
                    onChange={(event) => setBackgroundUrl(event.target.value)}
                    placeholder="https://example.com/background.jpg"
                    className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    Top-left header image URL
                  </span>
                  <input
                    type="url"
                    value={topLeftUrl}
                    onChange={(event) => setTopLeftUrl(event.target.value)}
                    placeholder="https://example.com/header.png"
                    className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100"
                  />
                </label>

                {appearanceError && (
                  <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                    {appearanceError}
                  </p>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={appearanceSaving}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {appearanceSaving ? "Saving..." : "Save appearance"}
                  </button>
                </div>
              </form>
            )}

            {activeTab === "notifications" && (
              <form
                onSubmit={handleNotificationSubmit}
                className="mx-auto max-w-2xl space-y-4"
              >
                <section className="space-y-1">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    Notifications
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Reminders fire while this app is open in a tab.
                  </p>
                </section>

                <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
                    Browser permission
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Status:{" "}
                    <span className="font-medium text-gray-700 dark:text-gray-200">
                      {permission}
                    </span>
                  </p>
                  {permission === "unsupported" && (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      This browser does not support the Notifications API.
                    </p>
                  )}
                  {canRequestPermission && (
                    <button
                      type="button"
                      onClick={handleRequestPermission}
                      className="mt-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      Allow notifications
                    </button>
                  )}
                  {isDenied && (
                    <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                      Notifications are blocked. Enable them in your browser site
                      settings.
                    </p>
                  )}
                </section>

                <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-800 dark:text-gray-200">
                      Enable reminders
                    </span>
                    <input
                      type="checkbox"
                      checked={notificationsEnabled}
                      onChange={(event) =>
                        setNotificationsEnabled(event.target.checked)
                      }
                      className="h-4 w-4"
                    />
                  </div>

                  <label className="mt-3 block space-y-1.5">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Default reminder
                    </span>
                    <select
                      value={defaultReminderMinutes}
                      onChange={(event) =>
                        setDefaultReminderMinutes(Number(event.target.value))
                      }
                      className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100"
                    >
                      {REMINDER_OPTIONS_MINUTES.map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {minutes === 0
                            ? "At start time"
                            : `${minutes} minutes before`}
                        </option>
                      ))}
                    </select>
                  </label>
                </section>

                <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-800 dark:text-gray-200">
                      Sound
                    </span>
                    <input
                      type="checkbox"
                      checked={notificationSoundEnabled}
                      onChange={(event) =>
                        setNotificationSoundEnabled(event.target.checked)
                      }
                      className="h-4 w-4"
                    />
                  </label>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Sound type
                      </span>
                      <select
                        value={effectiveSoundId}
                        onChange={(event) => setNotificationSound(event.target.value)}
                        disabled={!notificationSoundEnabled}
                        className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100"
                      >
                        {SOUND_OPTIONS.map((sound) => (
                          <option key={sound.id} value={sound.id}>
                            {sound.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Volume
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={notificationVolume}
                        disabled={!notificationSoundEnabled}
                        onChange={(event) =>
                          setNotificationVolume(Number(event.target.value))
                        }
                        className="w-full disabled:opacity-60"
                      />
                    </label>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleTestSound}
                      disabled={!notificationSoundEnabled}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      Test sound
                    </button>
                    <button
                      type="button"
                      onClick={handleTestNotification}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      Test notification
                    </button>
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
                    Calendar subscription
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Subscribe in Apple Calendar or Google Calendar for native
                    notifications.
                  </p>

                  {loadingToken ? (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Loading...
                    </p>
                  ) : subscriptionUrl ? (
                    <div className="mt-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={subscriptionUrl}
                          className="min-w-0 flex-1 rounded-md border border-gray-300 bg-gray-50 px-2.5 py-1.5 font-mono text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100"
                        />
                        <button
                          type="button"
                          onClick={handleCopyUrl}
                          className="flex shrink-0 items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          {copied ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                      <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                        <p>
                          <strong>iOS:</strong> Settings &gt; Calendar &gt;
                          Accounts &gt; Add Account &gt; Other &gt; Subscribe to
                          Calendar.
                        </p>
                        <p>
                          <strong>Google:</strong> Google Calendar &gt; Settings
                          &gt; Add calendar &gt; From URL.
                        </p>
                        <p className="text-amber-600 dark:text-amber-400">
                          Keep this URL private. Anyone with it can view your
                          calendar.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRegenerateToken}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        Regenerate URL
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      No subscription URL available.
                    </p>
                  )}
                </section>

                {notificationError && (
                  <p
                    className="text-sm text-red-600 dark:text-red-400"
                    role="alert"
                  >
                    {notificationError}
                  </p>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={notificationSaving}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {notificationSaving ? "Saving..." : "Save notifications"}
                  </button>
                </div>
              </form>
            )}

            {activeTab === "sync" && (
              <div className="mx-auto max-w-2xl space-y-4">
                <section className="space-y-1">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    Google Calendar sync
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Connect and sync events with your Google Calendar.
                  </p>
                </section>

                <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                        Status
                      </p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {googleStateLabel}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleGoogleCalendarClick}
                      disabled={googleSyncing || googleLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${googleSyncing ? "animate-spin" : ""}`}
                      />
                      {googleLabel}
                    </button>
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                    {googleStatus?.lastSyncedAt && !googleError && (
                      <p>
                        Last sync{" "}
                        {new Date(googleStatus.lastSyncedAt).toLocaleString()}
                      </p>
                    )}
                    {googleStatus?.watchExpiresAt && !googleError && (
                      <p>
                        Instant sync renews by{" "}
                        {new Date(googleStatus.watchExpiresAt).toLocaleDateString()}
                      </p>
                    )}
                    {googleStatus?.enabled && !googleStatus.webhookConfigured && (
                      <p className="text-amber-600 dark:text-amber-400">
                        Webhook URL is not configured, so sync may rely on manual
                        pulls.
                      </p>
                    )}
                  </div>

                  {googleError && (
                    <p
                      className="mt-3 text-sm text-red-600 dark:text-red-400"
                      role="alert"
                    >
                      {googleError}
                    </p>
                  )}
                </section>

                <button
                  type="button"
                  onClick={loadGoogleStatus}
                  disabled={googleLoading || googleSyncing}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Refresh status
                </button>
              </div>
            )}

            {activeTab === "account" && (
              <div className="mx-auto max-w-2xl space-y-4">
                <section className="space-y-1">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    Account
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Signed in as {user?.name ?? "your account"}.
                  </p>
                </section>

                <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/auth/signin" })}
                    className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
