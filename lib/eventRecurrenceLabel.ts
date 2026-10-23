import { RRule } from "rrule";

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
