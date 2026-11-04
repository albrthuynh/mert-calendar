import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const TOKEN_PREFIX = "mert-token:v1:";
const TOKEN_FIELDS = ["access_token", "refresh_token", "id_token"] as const;

function encryptionKeys() {
  const currentKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!currentKey || !/^[a-f0-9]{64}$/i.test(currentKey)) {
    throw new Error("TOKEN_ENCRYPTION_KEY must contain 32 random bytes encoded as hex");
  }
  const keys = [currentKey, ...(process.env.TOKEN_ENCRYPTION_PREVIOUS_KEYS?.split(",") ?? [])];
  return keys.map((key) => {
    if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error("Invalid token encryption key configuration");
    return Buffer.from(key, "hex");
  });
}

export function encryptToken(token: string, context: string): string {
  if (process.env.TOKEN_ENCRYPTION_MODE === "staged") return token;
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKeys()[0], nonce);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return TOKEN_PREFIX + Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function decryptToken(storedToken: string, context: string): string {
  // Legacy reads support deploying encryption before the resumable backfill runs.
  if (!storedToken.startsWith(TOKEN_PREFIX)) {
    if (storedToken.startsWith("mert-token:")) throw new Error("Unsupported token encryption version");
    if (process.env.TOKEN_ENCRYPTION_REQUIRE_ENCRYPTED === "true") throw new Error("Unencrypted Google credentials require migration");
    return storedToken;
  }
  const envelope = Buffer.from(storedToken.slice(TOKEN_PREFIX.length), "base64url");
  if (envelope.length < 28) throw new Error("Invalid encrypted token");
  for (const key of encryptionKeys()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, envelope.subarray(0, 12), { authTagLength: 16 });
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(envelope.subarray(12, 28));
      return Buffer.concat([decipher.update(envelope.subarray(28)), decipher.final()]).toString("utf8");
    } catch {
      // Previous keys allow rotation without making existing connections unreadable.
    }
  }
  throw new Error("Unable to decrypt stored Google credentials");
}

export function encryptAccountTokens<T extends { userId: string; access_token?: string | null; refresh_token?: string | null; id_token?: string | null }>(account: T): T {
  const encryptedAccount = { ...account };
  for (const field of TOKEN_FIELDS) {
    const token = account[field];
    if (typeof token === "string") encryptedAccount[field] = encryptToken(token, `${account.userId}:${field}`);
  }
  return encryptedAccount;
}

export function decryptAccountTokens<T extends { userId: string; access_token?: string | null; refresh_token?: string | null; id_token?: string | null }>(account: T): T {
  const decryptedAccount = { ...account };
  for (const field of TOKEN_FIELDS) {
    const token = account[field];
    if (typeof token === "string") decryptedAccount[field] = decryptToken(token, `${account.userId}:${field}`);
  }
  return decryptedAccount;
}

export function isEncryptedToken(token: string) {
  return token.startsWith(TOKEN_PREFIX);
}
