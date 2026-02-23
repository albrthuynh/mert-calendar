import { auth, signOut } from "@/lib/auth";
import { CalendarDays, LogOut } from "lucide-react";
import Image from "next/image";

export async function Navbar() {
  const session = await auth();

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-4 shrink-0 z-10">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
          <CalendarDays className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-gray-900 text-sm">
          Albert Calendar
        </span>
      </div>

      <div className="flex-1" />

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
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-semibold">
              {session.user.name?.[0]?.toUpperCase() ?? "U"}
            </div>
          )}
          <span className="text-sm text-gray-700 hidden sm:block">
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
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded hover:bg-gray-100 transition-colors"
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
