import { NextResponse } from "next/server";
import { isDateOnlyString } from "@/lib/jobApplications";

export const MAX_REQUEST_BYTES = 64 * 1024;
export const MAX_RANGE_DAYS = 400;

export function invalidRange(start: Date, end: Date) {
  return !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) ||
    start.getUTCFullYear() < 1970 || end.getUTCFullYear() > 2100 ||
    end < start || end.getTime() - start.getTime() > MAX_RANGE_DAYS * 86400000;
}

export function validateMutationPayload(pathname: string, method: string, body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Expected a JSON object");
  const fields = body as Record<string, unknown>;
  const textLimits: Record<string, number> = {
    title: 500, description: 16000, label: 120, company: 500, location: 500,
    salary: 500, notes: 16000, link: 2048, applicationUrl: 2048,
    backgroundUrl: 2048, topLeftUrl: 2048, timeZone: 100, recurrenceRule: 1000,
    color: 7, calendarColor: 7, notificationSound: 100,
  };
  for (const [field, limit] of Object.entries(textLimits)) {
    const value = fields[field];
    if (value !== undefined && value !== null && (typeof value !== "string" || value.length > limit)) {
      throw new Error(`${field} must be a string of ${limit} characters or fewer`);
    }
  }
  for (const field of ["startTime", "endTime", "taskDate", "dueDate", "instanceStartTime", "recurrenceEndDate"]) {
    const value = fields[field];
    if (value === null && !["dueDate", "recurrenceEndDate"].includes(field)) throw new Error(`${field} cannot be null`);
    if (value !== undefined && value !== null && (typeof value !== "string" || value.length > 40 || (!Number.isFinite(new Date(value).getTime()) || new Date(value).getUTCFullYear() < 1970 || new Date(value).getUTCFullYear() > 2100))) {
      throw new Error(`${field} must be a valid date string`);
    }
  }
  for (const field of ["date", "dateApplied"]) {
    if (fields[field] !== undefined && !isDateOnlyString(fields[field])) throw new Error(`${field} must be a valid calendar date`);
  }
  for (const field of ["completed", "allDay", "reminderDisabled", "notificationsEnabled", "notificationSoundEnabled"]) {
    if (fields[field] !== undefined && typeof fields[field] !== "boolean") throw new Error(`${field} must be a boolean`);
  }
  for (const field of ["reminderMinutes", "defaultReminderMinutes", "notificationVolume", "order"]) {
    const value = fields[field];
    const maximum = field === "order" ? 1000000 : field === "notificationVolume" ? 100 : 10080;
    if (value !== undefined && value !== null && (!Number.isInteger(value) || (value as number) < 0 || (value as number) > maximum)) {
      throw new Error(`${field} must be an integer between 0 and ${maximum}`);
    }
  }
  for (const field of ["color", "calendarColor"]) {
    if (fields[field] !== undefined && fields[field] !== null && !/^#[a-f0-9]{6}$/i.test(fields[field] as string)) throw new Error(`${field} must be a six-digit hex color`);
  }
  if (fields.calendarIds !== undefined && (!Array.isArray(fields.calendarIds) || fields.calendarIds.length > 20 || fields.calendarIds.some((id) => typeof id !== "string" || id.length > 1024))) {
    throw new Error("Choose at most 20 calendars");
  }
  if ((pathname.startsWith("/api/events") || pathname.startsWith("/api/todos")) && fields.title !== undefined && (typeof fields.title !== "string" || !fields.title.trim())) {
    throw new Error("title cannot be empty");
  }
  if (method === "POST" && (pathname === "/api/events" || pathname === "/api/todos") && (typeof fields.title !== "string" || !fields.title.trim())) {
    throw new Error("title is required");
  }
  if (method === "POST" && pathname === "/api/todos" && typeof fields.taskDate !== "string") throw new Error("taskDate is required");
  if (fields.recurrenceRule && !/(?:^|;|RRULE:)FREQ=(?:DAILY|WEEKLY|MONTHLY|YEARLY)(?:;|$)/i.test(fields.recurrenceRule as string)) {
    throw new Error("Repeats must use a daily, weekly, monthly, or yearly frequency");
  }
}

export function checkRequestOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return null;
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Cross-origin writes are not allowed" }, { status: 403 });
  }
  return null;
}

export async function readBoundedRequestBody(request: Request): Promise<string | NextResponse> {
  if (!request.body) return "";
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  }
  const reader = request.clone().body!.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 5000);
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_REQUEST_BYTES) {
        void reader.cancel().catch(() => {});
        return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
      }
      chunks.push(chunk.value);
    }
    if (timedOut) return NextResponse.json({ error: "Request body timed out" }, { status: 408 });
    return Buffer.concat(chunks).toString("utf8");
  } catch {
    return NextResponse.json({ error: "Could not read request body" }, { status: 400 });
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}

export async function checkMutationRequest(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return null;
  const rejectedOrigin = checkRequestOrigin(request);
  if (rejectedOrigin) return rejectedOrigin;
  if (!request.body) return null;
  const body = await readBoundedRequestBody(request);
  if (body instanceof NextResponse) return body;
  // Server adapters may expose an empty stream for requests sent without a body.
  if (body.length === 0) return null;
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  try {
    validateMutationPayload(new URL(request.url).pathname, request.method, JSON.parse(body));
    return null;
  } catch (error) {
    return NextResponse.json({ error: error instanceof SyntaxError ? "Invalid JSON body" : (error as Error).message }, { status: 400 });
  }
}
