import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Navbar } from "@/app/components/Navbar";
import { CalendarView } from "@/app/components/CalendarView";
import { CalendarPreferencesProvider } from "../context/CalendarPreferencesContext";
import { NotificationPreferencesProvider } from "../context/NotificationPreferencesContext";
import { GoogleCalendarConnectionProvider } from "../context/GoogleCalendarConnectionContext";
import { getGoogleCalendarStatus } from "@/lib/googleCalendar";

export default async function CalendarPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");
  const googleStatus = await getGoogleCalendarStatus(session.user.id).catch((error) => {
    console.error("Could not load initial Google Calendar status", error);
    return null;
  });

  return (
    <CalendarPreferencesProvider>
      <NotificationPreferencesProvider>
        <GoogleCalendarConnectionProvider key={session.user.id} initialStatus={googleStatus}>
          <div className="flex flex-col h-screen min-w-0 overflow-hidden bg-white dark:bg-gray-900">
            <Navbar session={session} />
            <CalendarView />
          </div>
        </GoogleCalendarConnectionProvider>
      </NotificationPreferencesProvider>
    </CalendarPreferencesProvider>
  );
}
