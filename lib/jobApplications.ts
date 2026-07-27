export const JOB_APPLICATION_STATUSES = [
  "APPLIED",
  "OA",
  "INTERVIEWING",
  "ACCEPTED",
  "REJECTED",
] as const;

export type JobApplicationStatus = (typeof JOB_APPLICATION_STATUSES)[number];

export function isJobApplicationStatus(
  value: unknown
): value is JobApplicationStatus {
  return (
    typeof value === "string" &&
    JOB_APPLICATION_STATUSES.some((status) => status === value)
  );
}

export function isDateOnlyString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsedDate = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === value
  );
}

export function optionalTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null;
}

export function normalizeApplicationUrl(value: unknown) {
  const trimmedUrl = optionalTrimmedString(value);
  if (!trimmedUrl) return null;

  const candidateUrl = /^https?:\/\//i.test(trimmedUrl)
    ? trimmedUrl
    : `https://${trimmedUrl}`;

  try {
    const parsedUrl = new URL(candidateUrl);
    return ["http:", "https:"].includes(parsedUrl.protocol)
      ? parsedUrl.toString()
      : null;
  } catch {
    return null;
  }
}
