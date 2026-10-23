export function normalizeGuestEmails(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    throw new Error("Enter between 1 and 50 guest email addresses.");
  }

  const emails = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== "string") throw new Error("Each guest needs a valid email address.");
    const email = candidate.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
      throw new Error(`Invalid guest email address: ${email}`);
    }
    emails.add(email);
  }
  return [...emails];
}

export type EventGuest = {
  email: string;
  displayName?: string;
  responseStatus?: string;
};

export type EventGuestScope = "event" | "series";
