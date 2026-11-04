import { encryptToken, decryptToken, encryptAccountTokens } from "@/lib/security/tokenEncryption";

const originalEnvironment = { ...process.env };
beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_MODE = "enabled";
  process.env.TOKEN_ENCRYPTION_KEY = "ab".repeat(32);
  delete process.env.TOKEN_ENCRYPTION_PREVIOUS_KEYS;
  delete process.env.TOKEN_ENCRYPTION_REQUIRE_ENCRYPTED;
});
afterEach(() => { process.env = { ...originalEnvironment }; });

it("encrypts identical credentials differently and authenticates their user and field", () => {
  const encrypted = encryptToken("secret-google-token", "user:refresh_token");
  expect(encrypted).not.toContain("secret-google-token");
  expect(encryptToken("secret-google-token", "user:refresh_token")).not.toBe(encrypted);
  expect(decryptToken(encrypted, "user:refresh_token")).toBe("secret-google-token");
  expect(() => decryptToken(encrypted, "other-user:refresh_token")).toThrow();
  expect(() => decryptToken(encrypted, "user:access_token")).toThrow();
  const tampered = Buffer.from(encrypted.slice("mert-token:v1:".length), "base64url");
  tampered[28] ^= 1;
  expect(() => decryptToken("mert-token:v1:" + tampered.toString("base64url"), "user:refresh_token")).toThrow();
});

it("supports legacy reads, explicit staging, nulls, and omitted tokens without silently disabling encryption", () => {
  expect(decryptToken("legacy-token", "user:access_token")).toBe("legacy-token");
  expect(encryptAccountTokens({ userId: "user", refresh_token: null })).toEqual({ userId: "user", refresh_token: null });
  delete process.env.TOKEN_ENCRYPTION_KEY;
  expect(() => encryptToken("secret", "user:access_token")).toThrow("TOKEN_ENCRYPTION_KEY");
  process.env.TOKEN_ENCRYPTION_MODE = "staged";
  expect(encryptToken("legacy-token", "user:access_token")).toBe("legacy-token");
});

it("allows key rotation while rejecting unknown versions and unauthenticated ciphertext", () => {
  const encrypted = encryptToken("secret", "user:access_token");
  process.env.TOKEN_ENCRYPTION_KEY = "cd".repeat(32);
  expect(() => decryptToken(encrypted, "user:access_token")).toThrow();
  process.env.TOKEN_ENCRYPTION_PREVIOUS_KEYS = "ab".repeat(32);
  expect(decryptToken(encrypted, "user:access_token")).toBe("secret");
  expect(() => decryptToken("mert-token:v1:abc", "user:access_token")).toThrow();
  expect(() => decryptToken("mert-token:v2:abc", "user:access_token")).toThrow();
});

it("can reject all remaining plaintext after the coordinated migration", () => {
  process.env.TOKEN_ENCRYPTION_REQUIRE_ENCRYPTED = "true";
  expect(() => decryptToken("legacy-token", "user:access_token")).toThrow("require migration");
  expect(decryptToken(encryptToken("secret", "user:access_token"), "user:access_token")).toBe("secret");
});
