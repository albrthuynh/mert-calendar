import { CalendarResponseBudget, CalendarWorkloadError } from "@/lib/security/workload";

it("limits response bytes across multiple batches without serializing an unbounded final response", () => {
  const budget = new CalendarResponseBudget();
  budget.consume([{ title: "Normal event" }]);
  const description = "a".repeat(16000);
  expect(() => {
    for (let batch = 0; batch < 300; batch++) budget.consume([{ description }]);
  }).toThrow(CalendarWorkloadError);
});
