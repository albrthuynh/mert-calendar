export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startTime: string; // ISO string
  endTime: string; // ISO string
  color: string;
  allDay: boolean;
  recurrenceRule: string | null;
  recurrenceEndDate: string | null;
  reminderMinutes: number | null; // null => use user default
  reminderDisabled: boolean; // true => suppress reminder even if defaults enabled
  isRecurringInstance: boolean;
  originalId: string;
  /**
   * For recurring instances, this is the series occurrence start (ISO) used to
   * identify the instance even if an override moves it.
   */
  instanceStartTime?: string | null;
}

export interface Todo {
  id: string;
  title: string;
  description: string | null;
  taskDate: string; // ISO string — the day this todo belongs to
  dueDate: string | null; // ISO string — optional specific due time
  completed: boolean;
  order: number;
}

export const EVENT_COLORS = [
  { label: "Blue", value: "#4285F4" },
  { label: "Red", value: "#EA4335" },
  { label: "Green", value: "#34A853" },
  { label: "Yellow", value: "#FBBC05" },
  { label: "Purple", value: "#9C27B0" },
  { label: "Teal", value: "#009688" },
  { label: "Pink", value: "#E91E63" },
  { label: "Orange", value: "#FF5722" },
] as const;

export const RECURRENCE_OPTIONS = [
  { label: "Does not repeat", value: "" },
  { label: "Daily", value: "FREQ=DAILY" },
  { label: "Weekly", value: "FREQ=WEEKLY" },
  { label: "Every weekday (Mon–Fri)", value: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
  { label: "Monthly", value: "FREQ=MONTHLY" },
  { label: "Yearly", value: "FREQ=YEARLY" },
] as const;
