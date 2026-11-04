import { createHash } from "node:crypto";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "@/lib/prisma";
import { encryptAccountTokens, decryptAccountTokens } from "./tokenEncryption";

export function encryptedPrismaAdapter(): Adapter {
  const adapter = PrismaAdapter(prisma);
  const sessionTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
  return {
    ...adapter,
    async createSession(session) {
      const stored = await adapter.createSession!({ ...session, sessionToken: sessionTokenHash(session.sessionToken) });
      return { ...stored, sessionToken: session.sessionToken };
    },
    async updateSession(session) {
      const stored = await adapter.updateSession!({ ...session, sessionToken: sessionTokenHash(session.sessionToken) });
      return stored ? { ...stored, sessionToken: session.sessionToken } : stored;
    },
    async deleteSession(sessionToken) {
      await adapter.deleteSession!(sessionTokenHash(sessionToken));
    },
    async linkAccount(account) {
      const storedAccount = await adapter.linkAccount!(encryptAccountTokens(account));
      return storedAccount ? decryptAccountTokens(storedAccount) : undefined;
    },
    async getAccount(providerAccountId, provider) {
      const account = await adapter.getAccount!(providerAccountId, provider);
      return account ? decryptAccountTokens(account) : null;
    },
    async getSessionAndUser(sessionToken) {
      const result = await prisma.session.findUnique({ where: { sessionToken: sessionTokenHash(sessionToken) }, include: { user: { select: { id: true, name: true, email: true, emailVerified: true, image: true, disabledAt: true } } } });
      if (!result || result.user.disabledAt || !result.user.email) return null;
      const { user, ...session } = result;
      return { user: { ...user, email: result.user.email }, session: { ...session, sessionToken } };
    },
  };
}
