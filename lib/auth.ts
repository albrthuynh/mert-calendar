import { logSecurityError } from "@/lib/security/logging";
import { randomBytes } from "node:crypto";
import NextAuth from "next-auth";
import { encryptedPrismaAdapter } from "@/lib/security/authAdapter";
import { encryptAccountTokens } from "@/lib/security/tokenEncryption";
import { prisma } from "./prisma";
import { authConfig } from "@/auth.config";
import type { Account, User } from "next-auth";
import { ensureGoogleCalendarWatches } from "@/lib/googleCalendar";

const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function hasGoogleCalendarScope(scope: string | null | undefined) {
  return !!scope?.split(/\s+/).includes(GOOGLE_CALENDAR_SCOPE);
}

async function persistGoogleCalendarConsent(
  user: User,
  account: Account | null | undefined
) {
  if (!user.id || account?.provider !== "google") return;

  const hasCalendarScope = hasGoogleCalendarScope(account.scope);
  await prisma.account.updateMany({
    where: {
      userId: user.id,
      provider: "google",
      providerAccountId: account.providerAccountId,
    },
    data: encryptAccountTokens({
      userId: user.id,
      access_token: account.access_token ?? undefined,
      refresh_token: account.refresh_token ?? undefined,
      expires_at: account.expires_at ?? undefined,
      token_type: account.token_type ?? undefined,
      scope: account.scope ?? undefined,
      id_token: account.id_token ?? undefined,
      session_state:
        typeof account.session_state === "string"
          ? account.session_state
          : undefined,
    }),
  });

  if (hasCalendarScope) {
    await prisma.user.updateMany({
      where: { id: user.id },
      data: { googleCalendarSyncEnabled: true },
    });
    await ensureGoogleCalendarWatches(user.id).catch((error) => {
      logSecurityError("Google Calendar watch setup failed", error);
    });
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: encryptedPrismaAdapter(),
  logger: {
    error(error) { logSecurityError("Authentication failed", error); },
  },
  session: {
    strategy: "database",
    generateSessionToken: () => randomBytes(32).toString("hex"),
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: 24 * 60 * 60,
  },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (user.id) {
        const existingUser = await prisma.user.findUnique({ where: { id: user.id }, select: { disabledAt: true } });
        if (existingUser?.disabledAt) return false;
      }
      await persistGoogleCalendarConsent(user, account);
      return true;
    },
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  events: {
    async linkAccount({ user, account }) {
      await persistGoogleCalendarConsent(user, account);
    },
  },
});
