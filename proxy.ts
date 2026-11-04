import { createContentSecurityPolicy } from "@/lib/security/contentSecurityPolicy";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/security/rateLimit";
import { checkMutationRequest, checkRequestOrigin, readBoundedRequestBody } from "@/lib/security/requestValidation";

function limitedResponse(retryAfter: number) {
  return NextResponse.json({ error: "Too many requests. Try again shortly." }, {
    status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" },
  });
}

const authenticatedProxy = auth(async (request) => {
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/api/")) return NextResponse.next({ request: { headers: request.headers } });
  const userId = request.auth?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  let limit = isMutation ? 90 : 360;
  let bucket = isMutation ? "write" : "read";
  if (pathname.endsWith("/guests") && isMutation) {
    limit = 10;
    bucket = "invite";
  } else if (pathname.startsWith("/api/google-calendar/")) {
    limit = isMutation ? 6 : 30;
    bucket = isMutation ? "google-write" : "google-read";
  }
  try {
    const quota = await consumeRateLimit(`user:${userId}:${bucket}`, limit, 60);
    if (!quota.allowed) return limitedResponse(quota.retryAfter);
  } catch {
    return NextResponse.json({ error: "Security checks unavailable. Try again shortly." }, { status: 503 });
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
});

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/api/")) {
    const isAuth = pathname.startsWith("/api/auth/");
    const isWebhook = pathname === "/api/google-calendar/webhook";
    const isCron = pathname === "/api/google-calendar/renew-watches";
    const isFeed = pathname.startsWith("/api/calendar/subscribe/");
    if (!isAuth && !isWebhook && !isCron) {
      const rejected = checkRequestOrigin(request);
      if (rejected) return rejected;
    }
    // Vercel overwrites this header at its edge. Never trust forwarded IPs on an unconfigured host.
    const clientAddress = process.env.VERCEL === "1"
      ? request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown"
      : "local-or-unconfigured-proxy";
    const bucket = isAuth ? "auth" : isWebhook ? "webhook" : isCron ? "cron" : isFeed ? "feed" : "api";
    try {
      const quota = await consumeRateLimit(`ip:${clientAddress}:${bucket}`, isAuth ? 60 : isFeed ? 30 : isCron ? 6 : 600, 60);
      if (!quota.allowed) return limitedResponse(quota.retryAfter);
    } catch {
      return NextResponse.json({ error: "Security checks unavailable. Try again shortly." }, { status: 503 });
    }
    if (!isAuth && !isWebhook && !isCron) {
      const rejected = await checkMutationRequest(request);
      if (rejected) return rejected;
    }
    if (isAuth || isWebhook || isCron || isFeed) {
      const body = await readBoundedRequestBody(request);
      if (body instanceof NextResponse) return body;
      return NextResponse.next();
    }
  }
  if (pathname.startsWith("/api/")) return authenticatedProxy(request, { params: Promise.resolve({}) });
  if (pathname === "/auth/signin" && request.method === "POST") {
    const clientAddress = process.env.VERCEL === "1" ? request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown" : "local";
    try {
      const quota = await consumeRateLimit(`signin:${clientAddress}`, 20, 60);
      if (!quota.allowed) return limitedResponse(quota.retryAfter);
    } catch {
      return NextResponse.json({ error: "Security checks unavailable. Try again shortly." }, { status: 503 });
    }
  }
  const { nonce, policy } = createContentSecurityPolicy(process.env.NODE_ENV !== "production");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = await authenticatedProxy(new NextRequest(request, { headers }), { params: Promise.resolve({}) });
  if (response) {
    response.headers.set("Content-Security-Policy", policy);
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export const config = { matcher: ["/", "/auth/signin", "/calendar/:path*", "/jobs/:path*", "/api/:path*"] };
