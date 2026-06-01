import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import { authConfig } from "@/auth.config";
import type { Account, User } from "next-auth";

const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

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
    data: {
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
    },
  });

  if (hasCalendarScope) {
    await prisma.user.updateMany({
      where: { id: user.id },
      data: { googleCalendarSyncEnabled: true },
    });
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      await persistGoogleCalendarConsent(user, account);
      return true;
    },
    jwt({ token, user }) {
      // Persist the user's DB id into the JWT on first sign-in
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  events: {
    async linkAccount({ user, account }) {
      await persistGoogleCalendarConsent(user, account);
    },
  },
});
