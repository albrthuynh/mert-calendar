import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Navbar } from "@/app/components/Navbar";
import { JobTracker } from "@/app/components/JobTracker";
import { CalendarPreferencesProvider } from "../context/CalendarPreferencesContext";
import { NotificationPreferencesProvider } from "../context/NotificationPreferencesContext";

export default async function JobsPage() {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  return (
    <CalendarPreferencesProvider>
      <NotificationPreferencesProvider>
        <div className="flex h-screen min-w-0 flex-col overflow-hidden bg-white dark:bg-stone-950">
          <Navbar session={session} />
          <JobTracker />
        </div>
      </NotificationPreferencesProvider>
    </CalendarPreferencesProvider>
  );
}
