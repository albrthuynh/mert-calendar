import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Navbar } from "@/app/components/Navbar";
import { CalendarView } from "@/app/components/CalendarView";
import { CalendarPreferencesProvider } from "../context/CalendarPreferencesContext";
import { NotificationPreferencesProvider } from "../context/NotificationPreferencesContext";

export default async function CalendarPage() {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  return (
    <CalendarPreferencesProvider>
      <NotificationPreferencesProvider>
        <div className="flex flex-col h-screen min-w-0 overflow-hidden bg-white dark:bg-gray-900">
          <Navbar />
          <CalendarView />
        </div>
      </NotificationPreferencesProvider>
    </CalendarPreferencesProvider>
  );
}
