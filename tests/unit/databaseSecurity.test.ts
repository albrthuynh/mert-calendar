import { secureDatabaseUrl } from "@/lib/security/databaseConnection";

it("requires certificate verification for remote databases without dropping authentication or query options", () => {
  const url = new URL(secureDatabaseUrl("postgresql://user:password@database.example/db?sslmode=require&uselibpqcompat=true&channel_binding=require"));
  expect(url.searchParams.get("sslmode")).toBe("verify-full");
  expect(url.searchParams.has("uselibpqcompat")).toBe(false);
  expect(url.searchParams.get("channel_binding")).toBe("require");
  expect(url.username).toBe("user");
  expect(url.password).toBe("password");
  expect(() => secureDatabaseUrl(undefined)).toThrow("DATABASE_URL");
});
