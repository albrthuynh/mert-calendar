import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Navbar } from "@/app/components/Navbar";
import { CalendarView } from "@/app/components/CalendarView";

export default async function CalendarPage() {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white dark:bg-gray-900">
      <Navbar />
      <CalendarView />
    </div>
  );
}
