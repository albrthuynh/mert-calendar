import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-compatible auth config — no Prisma, no Node.js-only modules.
 * Used by the proxy (middleware) and extended by the full auth config.
 */
export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isProtected = nextUrl.pathname.startsWith("/calendar");
      if (isProtected) {
        if (isLoggedIn) return true;
        const signInUrl = new URL("/auth/signin", nextUrl);
        signInUrl.searchParams.set("callbackUrl", nextUrl.href);
        return Response.redirect(signInUrl);
      }
      return true;
    },
  },
};
