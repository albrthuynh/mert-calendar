import { checkMutationRequest, invalidRange, validateMutationPayload } from "@/lib/security/requestValidation";

function writeRequest(body = "{}", headers: Record<string, string> = {}) {
  return new Request("https://calendar.example/api/todos", {
    method: "POST", headers: { origin: "https://calendar.example", "Content-Type": "application/json", ...headers }, body,
  });
}

it("rejects cross-origin writes and simple form submissions", async () => {
  expect((await checkMutationRequest(writeRequest("{}", { origin: "https://attacker.example" })))?.status).toBe(403);
  expect((await checkMutationRequest(writeRequest("{}", { origin: "null" })))?.status).toBe(403);
  expect((await checkMutationRequest(writeRequest("{}", { "sec-fetch-site": "cross-site" })))?.status).toBe(403);
  expect((await checkMutationRequest(writeRequest("title=test", { "Content-Type": "application/x-www-form-urlencoded" })))?.status).toBe(415);
});

it("bounds the actual body even if Content-Length lies, and rejects malformed JSON", async () => {
  expect((await checkMutationRequest(writeRequest("a".repeat(65537), { "Content-Length": "2" })))?.status).toBe(413);
  expect((await checkMutationRequest(writeRequest("{")))?.status).toBe(400);
  expect((await checkMutationRequest(writeRequest("[]")))?.status).toBe(400);
});

it("accepts valid writes without consuming the handler's body and permits bodyless actions", async () => {
  const payload = { title: "Homework", taskDate: "2026-11-03T00:00:00Z" };
  const request = writeRequest(JSON.stringify(payload));
  expect(await checkMutationRequest(request)).toBeNull();
  expect(await request.json()).toEqual(payload);
  expect(await checkMutationRequest(new Request("https://calendar.example/api/user/revoke-sessions", { method: "POST", headers: { origin: "https://calendar.example" } }))).toBeNull();
});

it.each([{ title: 123 }, { title: " " }, { dueDate: "invalid" }, { taskDate: "2500-01-01" }, { completed: "false" }, { order: -1 }, { description: "a".repeat(16001) }])("rejects unsafe todo payloads", (body) => {
  expect(() => validateMutationPayload("/api/todos/id", "PUT", body)).toThrow();
});

it("bounds calendar selection and query windows", () => {
  expect(() => validateMutationPayload("/api/google-calendar/calendars", "PUT", { calendarIds: Array(21).fill("calendar") })).toThrow();
  expect(invalidRange(new Date("2026-01-02"), new Date("2026-01-01"))).toBe(true);
  expect(invalidRange(new Date("2026-01-01"), new Date("2030-01-01"))).toBe(true);
  expect(invalidRange(new Date("2026-01-01"), new Date("2026-02-01"))).toBe(false);
});
