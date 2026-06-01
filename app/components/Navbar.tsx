"use client";

import { useEffect, useState } from "react";
import type { Session } from "next-auth";
import { signIn, signOut } from "next-auth/react";
import { LogOut, RefreshCw } from "lucide-react";
import Image from "next/image";
import { DarkModeToggle } from "./DarkModeToggle";
import { CalendarAppearanceModal } from "./CalendarAppearanceModal";
import { NotificationSettingsModal } from "./NotificationSettingsModal";
import { useCalendarPreferences } from "../context/CalendarPreferencesContext";
import { useNotificationPreferences } from "../context/NotificationPreferencesContext";

const GOOGLE_CALENDAR_SCOPE =
  "openid email profile https://www.googleapis.com/auth/calendar.events";

type GoogleCalendarStatus = {
  connected: boolean;
  enabled: boolean;
  hasCalendarScope: boolean;
  lastSyncedAt: string | null;
};

function UserMenu({
  user,
}: {
  user: { name?: string | null; image?: string | null } | null | undefined;
}) {
  const { backgroundUrl, topLeftUrl, setPreferences } = useCalendarPreferences();
  const notifPrefs = useNotificationPreferences();
  const [open, setOpen] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<GoogleCalendarStatus | null>(null);
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    fetch("/api/google-calendar/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((status) => {
        if (!cancelled && status) setGoogleStatus(status);
      })
      .catch(() => {
        if (!cancelled) setGoogleStatus(null);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!user) return null;

  const googleNeedsConsent =
    !googleStatus?.connected || !googleStatus?.hasCalendarScope;
  const googleLabel = googleNeedsConsent
    ? "Connect Google Calendar"
    : googleSyncing
      ? "Syncing Google Calendar"
      : googleStatus?.enabled
        ? "Sync Google Calendar"
        : "Enable Google Calendar";
  const googleStateLabel = !googleStatus?.connected
    ? "Not connected"
    : !googleStatus.hasCalendarScope
      ? "Calendar access needed"
      : googleStatus.enabled && googleStatus.lastSyncedAt
      ? "Connected, sync enabled"
      : googleStatus.enabled
      ? "Connected, waiting for first sync"
      : "Connected, sync off";

  async function handleGoogleCalendarClick() {
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
      const statusRes = await fetch("/api/google-calendar/status");
      if (statusRes.ok) setGoogleStatus(await statusRes.json());
      window.dispatchEvent(new Event("mert-calendar:events-updated"));
    } catch (error) {
      setGoogleError(
        error instanceof Error ? error.message : "Google Calendar sync failed."
      );
    } finally {
      setGoogleSyncing(false);
    }
  }

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-3"
        >
          {user.image ? (
            <Image
              src={user.image}
              alt={user.name ?? "User"}
              width={32}
              height={32}
              className="rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xs font-semibold">
              {user.name?.[0]?.toUpperCase() ?? "U"}
            </div>
          )}
          <span className="text-sm text-gray-700 dark:text-gray-300 hidden sm:block">
            {user.name}
          </span>
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-56 rounded-md bg-white dark:bg-gray-900 shadow-lg border border-gray-200 dark:border-gray-700 z-30">
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 disabled:opacity-60"
              disabled={googleSyncing}
              onClick={handleGoogleCalendarClick}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${googleSyncing ? "animate-spin" : ""}`}
              />
              <span>{googleLabel}</span>
            </button>
            {googleStatus && (
              <div className="px-3 pb-2 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                Google Calendar: {googleStateLabel}
              </div>
            )}
            {googleError && (
              <div className="px-3 pb-2 text-[11px] leading-snug text-red-600 dark:text-red-400">
                {googleError}
              </div>
            )}
            {googleStatus?.lastSyncedAt && !googleError && (
              <div className="px-3 pb-2 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                Last sync {new Date(googleStatus.lastSyncedAt).toLocaleString()}
              </div>
            )}
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => {
                setOpen(false);
                setShowAppearance(true);
              }}
            >
              Calendar appearance
            </button>
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => {
                setOpen(false);
                setShowNotifications(true);
              }}
            >
              Notifications
            </button>
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
              onClick={() => signOut({ callbackUrl: "/auth/signin" })}
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        )}
      </div>
      {showAppearance && (
        <CalendarAppearanceModal
          initialBackgroundUrl={backgroundUrl}
          initialTopLeftUrl={topLeftUrl}
          onSave={async (prefs) => {
            await fetch("/api/user/calendar-settings", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(prefs),
            });
            setPreferences(prefs);
          }}
          onClose={() => setShowAppearance(false)}
        />
      )}
      {showNotifications && (
        <NotificationSettingsModal
          initial={{
            notificationsEnabled: notifPrefs.notificationsEnabled,
            defaultReminderMinutes: notifPrefs.defaultReminderMinutes,
            notificationSoundEnabled: notifPrefs.notificationSoundEnabled,
            notificationSound: notifPrefs.notificationSound,
            notificationVolume: notifPrefs.notificationVolume,
          }}
          onSave={async (prefs) => {
            const res = await fetch("/api/user/notification-settings", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(prefs),
            });
            if (!res.ok) {
              const text = await res.text();
              throw new Error(text || "Failed to save notification settings");
            }
            notifPrefs.setPreferences(prefs);
          }}
          onClose={() => setShowNotifications(false)}
        />
      )}
    </>
  );
}

const DEFAULT_LOGO = "/tbh-creature-autism-creature.gif";

export function Navbar({ session }: { session: Session | null }) {
  const { topLeftUrl } = useCalendarPreferences();

  return (
    <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center px-4 gap-4 shrink-0 z-10">
      <div className="flex items-center gap-2">
        {topLeftUrl ? (
          <img
            src={topLeftUrl}
            alt="Calendar"
            width={32}
            height={32}
            className="w-8 h-8 rounded-md object-cover"
          />
        ) : (
          <Image
            src={DEFAULT_LOGO}
            alt="Mert Calendar"
            width={32}
            height={32}
            className="w-8 h-8 object-contain"
            unoptimized
          />
        )}
        <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
          Mert Calendar
        </span>
      </div>

      <div className="flex-1" />

      <DarkModeToggle />

      <UserMenu user={session?.user} />
    </header>
  );
}
