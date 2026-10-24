import { RRule } from "rrule";
import { format } from "date-fns";

export function getRecurrenceEndDateInputValue(rule: string | null, endDate: string | null): string {
  if (endDate) return endDate.slice(0, 10);
  if (!rule) return "";
  try {
    const until = RRule.parseString(rule).until;
    return until ? format(until, "yyyy-MM-dd") : "";
  } catch {
    return "";
  }
}

export function getRecurrenceLabel(rule: string, recurrenceEndDate?: string | null): string {
  try {
    const options = RRule.parseString(rule.replace(/^RRULE:/i, ""));
    if (recurrenceEndDate) options.until = new Date(recurrenceEndDate);
    const label = new RRule(options).toText();
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return "Repeats on a custom schedule";
  }
}
