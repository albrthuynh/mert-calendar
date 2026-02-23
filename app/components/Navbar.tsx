import { auth, signOut } from "@/lib/auth";
import { LogOut } from "lucide-react";
import Image from "next/image";
import { DarkModeToggle } from "./DarkModeToggle";

export async function Navbar() {
  const session = await auth();

  return (
    <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center px-4 gap-4 shrink-0 z-10">
      <div className="flex items-center gap-2">
        <Image
          src="/tbh-creature-autism-creature.gif"
          alt="Mert Calendar"
          width={32}
          height={32}
          className="w-8 h-8 object-contain"
          unoptimized
        />
        <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
          Mert Calendar
        </span>
      </div>

      <div className="flex-1" />

      <DarkModeToggle />

      {session?.user && (
        <div className="flex items-center gap-3">
          {session.user.image ? (
            <Image
              src={session.user.image}
              alt={session.user.name ?? "User"}
              width={32}
              height={32}
              className="rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xs font-semibold">
              {session.user.name?.[0]?.toUpperCase() ?? "U"}
            </div>
          )}
          <span className="text-sm text-gray-700 dark:text-gray-300 hidden sm:block">
            {session.user.name}
          </span>

          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/auth/signin" });
            }}
          >
            <button
              type="submit"
              className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:block">Sign out</span>
            </button>
          </form>
        </div>
      )}
    </header>
  );
}
