export function normalizeCalendarColor(input: unknown): string | null | undefined {
  if (input === undefined || input === null) return input;
  if (typeof input !== "string" || !/^#[0-9a-f]{6}$/i.test(input)) {
    throw new Error("Calendar color must be a six-digit hex color or null");
  }
  return input.toLowerCase();
}

export function normalizeCalendarImageUrl(input: unknown): string | null | undefined {
  if (input === undefined || input === null) return input;
  if (typeof input !== "string") throw new Error("Image URL must be a string or null");
  const trimmedUrl = input.trim();
  if (!trimmedUrl) return null;
  if (trimmedUrl.length > 2048) throw new Error("Image URL must be 2048 characters or fewer");
  let imageUrl: URL;
  try {
    imageUrl = new URL(trimmedUrl);
  } catch {
    throw new Error("Image URL must be a valid HTTPS URL");
  }
  if (imageUrl.protocol !== "https:" || imageUrl.username || imageUrl.password) {
    throw new Error("Image URL must use HTTPS without embedded credentials");
  }
  return imageUrl.href;
}
