"use client";

import { format, isSameDay, isToday } from "date-fns";
import { CalendarPlus, ListPlus } from "lucide-react";
import { type CalendarEvent, type Todo } from "@/types/calendar";
import { getEventsForDay } from "@/lib/calendarEventGrouping";
import { MobileEventCard } from "./MobileEventCard";
import { TodoItem } from "./TodoItem";

type MobileWeekAgendaTab = "todos" | "events";

interface MobileWeekAgendaProps {
  weekDays: Date[];
  selectedDay: Date;
  events: CalendarEvent[];
  todos: Todo[];
  activeTab: MobileWeekAgendaTab;
  hasBackground: boolean;
  onSelectDay: (day: Date) => void;
  onAddEvent: (day: Date) => void;
  onAddTodo: (day: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  onTodoToggle: (id: string, completed: boolean) => void;
  onTodoDelete: (id: string) => void;
  onTodoEdit: (id: string, title: string) => void;
  onTodoUpdate: (todo: Todo) => void;
}

export function MobileWeekAgenda({
  weekDays,
  selectedDay,
  events,
  todos,
  activeTab,
  hasBackground,
  onSelectDay,
  onAddEvent,
  onAddTodo,
  onEventClick,
  onTodoToggle,
  onTodoDelete,
  onTodoEdit,
  onTodoUpdate,
}: MobileWeekAgendaProps) {
  return (
    <div className="h-full overflow-y-auto px-3 pb-6 pt-2">
      <div className="space-y-3">
        {weekDays.map((day) => {
          const dayEvents = getEventsForDay(events, day);
          const dayTodos = todos.filter((todo) =>
            isSameDay(new Date(todo.taskDate), day)
          );
          const itemCount =
            activeTab === "events" ? dayEvents.length : dayTodos.length;
          const dayIsSelected = isSameDay(day, selectedDay);
          const dayIsToday = isToday(day);

          return (
            <section
              key={day.toISOString()}
              className={`overflow-hidden rounded-xl border bg-white/90 dark:bg-gray-900/90 ${
                dayIsSelected
                  ? "border-blue-300 shadow-sm dark:border-blue-800"
                  : "border-gray-200 dark:border-gray-800"
              }`}
            >
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2.5 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => onSelectDay(day)}
                  className="flex min-w-0 items-center gap-2 text-left"
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
                      dayIsToday
                        ? "bg-blue-500 text-white"
                        : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">
                      {format(day, "EEEE")}
                    </span>
                    <span className="block text-[11px] text-gray-400 dark:text-gray-500">
                      {itemCount} {activeTab === "events" ? "event" : "task"}
                      {itemCount === 1 ? "" : "s"}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    activeTab === "events" ? onAddEvent(day) : onAddTodo(day)
                  }
                  className="rounded-lg p-2 text-blue-500 transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/40"
                  aria-label={`Add ${activeTab === "events" ? "event" : "task"} for ${format(
                    day,
                    "EEEE, MMMM d"
                  )}`}
                >
                  {activeTab === "events" ? (
                    <CalendarPlus className="h-4 w-4" />
                  ) : (
                    <ListPlus className="h-4 w-4" />
                  )}
                </button>
              </div>

              <div className="space-y-2 p-2.5">
                {activeTab === "events" ? (
                  dayEvents.length > 0 ? (
                    dayEvents.map((event) => (
                      <MobileEventCard
                        key={`${event.originalId}-${event.startTime}`}
                        event={event}
                        hasBackground={hasBackground}
                        onClick={onEventClick}
                      />
                    ))
                  ) : (
                    <p className="px-1 py-2 text-xs text-gray-400 dark:text-gray-500">
                      No events
                    </p>
                  )
                ) : dayTodos.length > 0 ? (
                  dayTodos.map((todo) => (
                    <TodoItem
                      key={todo.id}
                      todo={todo}
                      onToggle={onTodoToggle}
                      onDelete={onTodoDelete}
                      onEdit={onTodoEdit}
                      onUpdate={onTodoUpdate}
                      variant="sidebar"
                    />
                  ))
                ) : (
                  <p className="px-1 py-2 text-xs text-gray-400 dark:text-gray-500">
                    No tasks
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
