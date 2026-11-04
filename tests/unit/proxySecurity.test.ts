import { NextRequest } from "next/server";
import proxy from "@/proxy";
import { consumeRateLimit } from "@/lib/security/rateLimit";

jest.mock("@/lib/auth", () => ({ auth: (handler: unknown) => handler }));
jest.mock("@/lib/security/rateLimit", () => ({ consumeRateLimit: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  (consumeRateLimit as jest.Mock).mockResolvedValue({ allowed: true, retryAfter: 60 });
});

it("returns 429 with a retry hint and fails closed when quota storage is unavailable", async () => {
  (consumeRateLimit as jest.Mock).mockResolvedValue({ allowed: false, retryAfter: 12 });
  const response = await proxy(new NextRequest("https://calendar.example/api/events"));
  expect(response?.status).toBe(429);
  expect(response?.headers.get("Retry-After")).toBe("12");
  (consumeRateLimit as jest.Mock).mockRejectedValue(new Error("sensitive database details"));
  const unavailable = await proxy(new NextRequest("https://calendar.example/api/events"));
  expect(unavailable?.status).toBe(503);
  expect(await unavailable?.text()).not.toContain("sensitive database details");
});

it("requires a session for private APIs, and keys authenticated limits to the user", async () => {
  expect((await proxy(new NextRequest("https://calendar.example/api/events")))?.status).toBe(401);
  const request = new NextRequest("https://calendar.example/api/events");
  Object.assign(request, { auth: { user: { id: "current-user" } } });
  expect((await proxy(request))?.status).toBe(200);
  expect(consumeRateLimit).toHaveBeenCalledWith("user:current-user:read", 360, 60);
});

it("preserves OAuth callbacks and secret-authenticated public integrations without allowing cross-origin custom writes", async () => {
  expect((await proxy(new NextRequest("https://calendar.example/api/auth/callback/google", { method: "POST", body: "code=test" })))?.status).toBe(200);
  expect((await proxy(new NextRequest("https://calendar.example/api/google-calendar/webhook", { method: "POST" })))?.status).toBe(200);
  expect((await proxy(new NextRequest("https://calendar.example/api/calendar/subscribe/token")))?.status).toBe(200);
  const forged = await proxy(new NextRequest("https://calendar.example/api/user/revoke-sessions", { method: "POST", headers: { origin: "https://attacker.example" } }));
  expect(forged?.status).toBe(403);
});

it("generates unique page nonces and forwards the policy to rendering", async () => {
  const first = await proxy(new NextRequest("https://calendar.example/auth/signin"));
  const second = await proxy(new NextRequest("https://calendar.example/auth/signin"));
  const policy = first?.headers.get("Content-Security-Policy");
  expect(policy).toContain("'strict-dynamic'");
  expect(policy).not.toBe(second?.headers.get("Content-Security-Policy"));
  expect(first?.headers.get("x-middleware-request-x-nonce")).toBeTruthy();
});
