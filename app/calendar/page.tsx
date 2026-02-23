import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Navbar } from "@/app/components/Navbar";
import { WeekView } from "@/app/components/WeekView";

export default async function CalendarPage() {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white dark:bg-gray-900">
      <Navbar />
      <WeekView />
    </div>
  );
}
