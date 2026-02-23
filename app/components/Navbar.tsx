"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import Image from "next/image";
import { DarkModeToggle } from "./DarkModeToggle";
import { CalendarAppearanceModal } from "./CalendarAppearanceModal";
import { useCalendarPreferences } from "../context/CalendarPreferencesContext";

function UserMenu({
  user,
}: {
  user: { name?: string | null; image?: string | null } | null | undefined;
}) {
  const { backgroundUrl, topLeftUrl, setPreferences } = useCalendarPreferences();
  const [open, setOpen] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);

  if (!user) return null;

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
          <div className="absolute right-0 mt-2 w-44 rounded-md bg-white dark:bg-gray-900 shadow-lg border border-gray-200 dark:border-gray-700 z-30">
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
    </>
  );
}

const DEFAULT_LOGO = "/tbh-creature-autism-creature.gif";

export function Navbar() {
  const { data: session } = useSession();
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
