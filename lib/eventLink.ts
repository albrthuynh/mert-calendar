export function normalizeEventLink(input: unknown): string | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;
  if (typeof input !== "string") {
    throw new Error("link must be a string or null");
  }

  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2048) {
    throw new Error("link must be 2048 characters or fewer");
  }

  const normalized = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("link must be a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("link must start with http:// or https://");
  }

  return url.toString();
}
