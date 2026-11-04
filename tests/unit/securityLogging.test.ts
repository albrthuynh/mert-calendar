import { logSecurityError, publicErrorMessage } from "@/lib/security/logging";
import { createContentSecurityPolicy } from "@/lib/security/contentSecurityPolicy";

it("keeps raw server errors and credentials out of client errors and logs", () => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  const error = Object.assign(new Error("password=secret refresh_token=secret"), { code: "P2022" });
  logSecurityError("Calendar request failed", error);
  expect(JSON.stringify(log.mock.calls)).not.toContain("password");
  expect(publicErrorMessage(error, "Try again shortly")).toBe("Try again shortly");
  expect(publicErrorMessage(Object.assign(new Error("Reconnect Google Calendar"), { status: 409 }), "Try again")).toBe("Reconnect Google Calendar");
  log.mockRestore();
});

it("permits eval only during development, with fresh nonces and production HTTPS enforcement", () => {
  const production = createContentSecurityPolicy(false);
  expect(production.policy).not.toContain("unsafe-eval");
  expect(production.policy).toContain("upgrade-insecure-requests");
  expect(production.policy).toContain(`'nonce-${production.nonce}'`);
  expect(createContentSecurityPolicy(false).nonce).not.toBe(production.nonce);
  expect(createContentSecurityPolicy(true).policy).toContain("unsafe-eval");
});
