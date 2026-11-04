export function secureDatabaseUrl(databaseUrl: string | undefined) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("DATABASE_URL must use PostgreSQL");
  const localDatabase = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!localDatabase || process.env.NODE_ENV === "production") {
    // Keep certificate and hostname verification explicit across pg version changes.
    url.searchParams.set("sslmode", "verify-full");
    url.searchParams.delete("uselibpqcompat");
  }
  return url.toString();
}
