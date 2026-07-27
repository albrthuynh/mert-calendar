"use client";

import { useState } from "react";
import type { Session } from "next-auth";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, CalendarDays } from "lucide-react";
import { DarkModeToggle } from "./DarkModeToggle";
import { SettingsModal } from "./SettingsModal";
import { useCalendarPreferences } from "../context/CalendarPreferencesContext";
import { useNotificationPreferences } from "../context/NotificationPreferencesContext";

function UserMenu({
  user,
}: {
  user: { name?: string | null; image?: string | null } | null | undefined;
}) {
  const { backgroundUrl, topLeftUrl, setPreferences } = useCalendarPreferences();
  const notifPrefs = useNotificationPreferences();
  const [showSettings, setShowSettings] = useState(false);

  if (!user) return null;

  return (
    <>
      <div>
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-3"
          aria-label="Open settings"
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
      </div>
      {showSettings && (
        <SettingsModal
          user={user}
          initialAppearance={{ backgroundUrl, topLeftUrl }}
          initialNotifications={{
            notificationsEnabled: notifPrefs.notificationsEnabled,
            defaultReminderMinutes: notifPrefs.defaultReminderMinutes,
            notificationSoundEnabled: notifPrefs.notificationSoundEnabled,
            notificationSound: notifPrefs.notificationSound,
            notificationVolume: notifPrefs.notificationVolume,
          }}
          onSaveAppearance={async (prefs) => {
            await fetch("/api/user/calendar-settings", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(prefs),
            });
            setPreferences(prefs);
          }}
          onSaveNotifications={async (prefs) => {
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
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}

const DEFAULT_LOGO = "/tbh-creature-autism-creature.gif";

export function Navbar({ session }: { session: Session | null }) {
  const { topLeftUrl } = useCalendarPreferences();
  const pathname = usePathname();

  return (
    <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center px-3 sm:px-4 gap-2 sm:gap-4 shrink-0 z-20">
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
        <span className="hidden font-semibold text-gray-900 dark:text-gray-100 text-sm md:block">
          Mert Calendar
        </span>
      </div>

      <nav className="flex items-center rounded-xl bg-gray-100 p-1 dark:bg-gray-800" aria-label="Main navigation">
        <Link
          href="/calendar"
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 ${
            pathname === "/calendar"
              ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white"
              : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          }`}
        >
          <CalendarDays size={15} />
          <span className="hidden xs:inline sm:inline">Calendar</span>
        </Link>
        <Link
          href="/jobs"
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 ${
            pathname === "/jobs"
              ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white"
              : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          }`}
        >
          <BriefcaseBusiness size={15} />
          <span className="hidden xs:inline sm:inline">Job tracker</span>
        </Link>
      </nav>

      <div className="flex-1" />

      <DarkModeToggle />

      <UserMenu user={session?.user} />
    </header>
  );
}
