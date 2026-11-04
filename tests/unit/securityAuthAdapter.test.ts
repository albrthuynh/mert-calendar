import { createHash } from "node:crypto";
import { encryptedPrismaAdapter } from "@/lib/security/authAdapter";
import { prisma } from "@/lib/prisma";
import { encryptAccountTokens } from "@/lib/security/tokenEncryption";

jest.mock("@/lib/prisma", () => ({ prisma: { session: { create: jest.fn(), update: jest.fn(), delete: jest.fn(), findUnique: jest.fn() }, account: { create: jest.fn(), findFirst: jest.fn() } } }));
jest.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: (client: typeof prisma) => ({
  createSession: (session: unknown) => client.session.create({ data: session } as never),
  updateSession: (session: unknown) => client.session.update({ data: session } as never),
  deleteSession: (token: string) => client.session.delete({ where: { sessionToken: token } }),
  linkAccount: (account: unknown) => client.account.create({ data: account } as never),
  getAccount: () => client.account.findFirst(),
}) }));

beforeEach(() => {
  jest.resetAllMocks();
  process.env.TOKEN_ENCRYPTION_KEY = "ab".repeat(32);
  process.env.TOKEN_ENCRYPTION_MODE = "enabled";
  (prisma.session.create as jest.Mock).mockImplementation(async ({ data }) => data);
  (prisma.account.create as jest.Mock).mockImplementation(async ({ data }) => data);
});

it("stores hashed session tokens, preserves the browser token, and denies disabled or revoked sessions", async () => {
  const adapter = encryptedPrismaAdapter();
  const session = { userId: "user", sessionToken: "browser-secret", expires: new Date(Date.now() + 100000) };
  const hash = createHash("sha256").update(session.sessionToken).digest("hex");
  expect(await adapter.createSession!(session)).toEqual(session);
  expect(prisma.session.create).toHaveBeenCalledWith({ data: { ...session, sessionToken: hash } });
  const user = { id: "user", email: "user@example.com", disabledAt: null };
  (prisma.session.findUnique as jest.Mock).mockResolvedValue({ ...session, sessionToken: hash, user });
  expect((await adapter.getSessionAndUser!("browser-secret"))?.session.sessionToken).toBe("browser-secret");
  expect(prisma.session.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { sessionToken: hash } }));
  (prisma.session.findUnique as jest.Mock).mockResolvedValue({ ...session, user: { ...user, disabledAt: new Date() } });
  expect(await adapter.getSessionAndUser!("browser-secret")).toBeNull();
  (prisma.session.findUnique as jest.Mock).mockResolvedValue(null);
  expect(await adapter.getSessionAndUser!("browser-secret")).toBeNull();
  await adapter.deleteSession!("browser-secret");
  expect(prisma.session.delete).toHaveBeenCalledWith({ where: { sessionToken: hash } });
});

it("encrypts provider credentials on account linking and decrypts only for server consumers", async () => {
  const adapter = encryptedPrismaAdapter();
  const account = { userId: "user", provider: "google", providerAccountId: "google-id", type: "oauth" as const, access_token: "access-secret", refresh_token: "refresh-secret", id_token: "id-secret" };
  expect(await adapter.linkAccount!(account)).toEqual(account);
  const stored = (prisma.account.create as jest.Mock).mock.calls[0][0].data;
  expect(JSON.stringify(stored)).not.toContain("access-secret");
  expect(stored.refresh_token).toMatch(/^mert-token:v1:/);
  (prisma.account.findFirst as jest.Mock).mockResolvedValue(encryptAccountTokens(account));
  expect(await adapter.getAccount!("google-id", "google")).toEqual(account);
});
