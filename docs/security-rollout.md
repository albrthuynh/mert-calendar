# Security rollout

Local development and production currently share a database. The additive migration `20261104000000_security_controls` has been applied. The new security code has not been deployed to Vercel, and credential encryption is deliberately staged locally so the existing production code can still read stored credentials.

## What changes

- Private API requests require a valid, revocable database session. Sessions have a 30-day rolling lifetime. Stored session tokens are SHA-256 hashes of random 256-bit browser tokens. Disabling a user with `User.disabledAt`, deleting an account, or deleting its sessions takes effect on subsequent requests. Settings → Account → Sign out all devices deletes only the current user's sessions.
- Switching from JWT sessions invalidates existing browser logins once. Users must sign in again after deployment; their calendar records remain intact.
- All API requests have PostgreSQL-backed atomic rate limits. No Redis account or paid service is needed. Rate-limit storage failure returns 503 instead of silently bypassing protection.
- Google access, refresh, and ID tokens use AES-256-GCM with a fresh 96-bit nonce and authenticated user/field context. The encryption key is independent of `AUTH_SECRET`. Credentials are encrypted at the Auth.js adapter, consent update, and refresh boundaries.
- Syncs and repairs share a per-user distributed lease, with a 4-minute operation budget, 15-second Google request timeouts, bounded pagination/import payloads, and database query timeouts. A stalled lease expires after 15 minutes; it is not held indefinitely after a terminated instance.

## Coordinated activation

1. Back up the database and keep a protected copy of the new encryption key. A 32-byte random key was generated in the local ignored `.env.local`; do not print it in logs or commit it. Configure **the same** `TOKEN_ENCRYPTION_KEY` in Vercel production and every other active app connected to this database. Use sensitive environment variables in Vercel. Do not reuse `AUTH_SECRET`.
2. Deploy the new application code to all active runtimes with `TOKEN_ENCRYPTION_MODE=staged` and `TOKEN_ENCRYPTION_REQUIRE_ENCRYPTED=false`. This deliberately preserves plaintext writes during the transition. Restrict or retire old deployment URLs, cron targets, preview environments, and other database clients that could run the old credential code. Prefer separate databases for future preview/development deployments.
3. Verify Google sign-in, calendar read/write sync, settings saves, feed subscriptions, and sign-out/revocation. Check that ordinary usage does not trigger unintended 429s. Existing logins expire because the session strategy changed; this is expected.
4. Set `TOKEN_ENCRYPTION_MODE=enabled` everywhere and redeploy/restart all active runtimes. New credentials now encrypt automatically; legacy plaintext credentials remain readable until the backfill. Do not run conversion while an older or staged process can still read/write the shared account tokens.
5. Run a dry check with Node 22.18+ or Node 24:

   ```sh
   npm run tokens:encrypt
   ```

   It prints counts only. Then, once all clients are ready:

   ```sh
   TOKEN_ENCRYPTION_MODE=enabled npm run tokens:encrypt -- --write --confirm-all-runtimes-ready
   npm run tokens:encrypt
   ```

   The write command compares the original token columns before updating each account so it cannot overwrite a concurrent reconnect/refresh. Re-running it is safe and also re-encrypts existing envelopes with the current key. If an account was skipped due to a concurrent update, rerun until the dry check reports zero plaintext tokens. No token values or user identifiers are printed.
6. Set `TOKEN_ENCRYPTION_REQUIRE_ENCRYPTED=true` in every runtime and redeploy/restart. This removes legacy plaintext reads. Confirm the dry check still succeeds and Google sync still works.
7. Configure `CRON_SECRET` (or the existing `GOOGLE_CALENDAR_CRON_SECRET`) and schedule `/api/google-calendar/renew-watches` with its bearer secret at least daily. It renews watches and deletes expired rate-limit buckets, leases, and sessions. The endpoint is disabled when no secret is configured, including development. A Vercel Cron job uses `CRON_SECRET` automatically; use the project dashboard/config to schedule the authenticated endpoint. Avoid reusing `AUTH_SECRET` or the encryption key.

Do not roll back to a build that cannot decrypt tokens after conversion. Retain a compatible build and all required keys for recovery. No external secret environment or production deployment was changed during implementation.

## Key rotation

Deploy a new `TOKEN_ENCRYPTION_KEY` with the previous key(s) in comma-separated `TOKEN_ENCRYPTION_PREVIOUS_KEYS`. The application writes with the new key and can read old ciphertext using previous keys. Run the same migration command to re-encrypt tokens. Verify all running versions and disaster-recovery backups before retiring previous keys. Losing the key requires users to reconnect Google Calendar.

## Request limits

| Scope | Limit per minute |
| --- | ---: |
| Authenticated reads | 360 per user |
| Authenticated writes | 90 per user |
| Google status/calendar-list reads | 30 per user |
| Google sync/calendar-selection writes | 6 per user |
| Guest invitations | 10 per user |
| Public API traffic | 600 per source IP |
| OAuth endpoints | 60 per source IP |
| Sign-in server action | 20 per source IP |
| Calendar subscriptions | 30 per source IP |
| Cron endpoint | 6 per source IP |

Both IP and user limits apply. Source IPs are trusted from the overwritten Vercel forwarding header only when running on Vercel. On other hosts, requests share a conservative fallback bucket; configure a trusted edge before changing this behavior. Database keys hash rate-limit identities. Body-validation and downstream failures consume the appropriate quota; cheap Origin rejections happen before storage access. No process-local fallback is used.

Bodies are limited to 64 KiB and a 5-second streamed read budget, including OAuth/webhook bodies. Custom writes require a matching Origin and JSON for nonempty bodies; OAuth callbacks and independently secret-authenticated webhook/cron requests are exempt from Origin checks. Browserless clients must provide the correct Origin along with their authenticated session. Server Actions have the same 64 KiB size limit and retain Next.js origin protections.

Calendar ranges must be ordered, no more than 400 days, and within 1970–2100. Range reads cap source records at 2,000, overrides at 10,000, expanded results at 10,000, and serialized event/task data at 4 MiB. Oversized results return 422 instead of silently truncating. Recurrence frequencies faster than daily and schedules with more than 24 times per day are rejected; zero/negative intervals and invalid time selectors are rejected before iteration. Existing malformed/dense imported recurrences fall back to the original event rather than expanding without bounds.

## Browser and infrastructure protections

Production pages use fresh nonce-based script CSP, disable framing/plugin objects, restrict connections to this app, and require HTTPS resources. Inline styles remain permitted for calendar positioning and theme colors. Development permits eval and WebSockets for Next.js debugging only. `next-themes` receives the same nonce as the framework scripts. HTML and API responses containing private data are not shared-cacheable. Feed URLs remain bearer secrets; rotating a feed token prevents subsequent reads but cannot retract events already downloaded elsewhere.

Remote runtime database connections explicitly verify TLS certificates and hostnames. Pools cap connections and queries have timeouts. Server logs record error types and Prisma error codes, not raw credential-bearing exceptions. Google integration 5xx responses use generic messages. New image settings require HTTPS; arbitrary HTTPS image hosts still receive the browser's IP address when users choose to load them.

Hosting/database access roles, backups, encryption keys in production, log retention, old deployment access, DDoS protection at the hosting edge, and actual recovery procedures still need operational verification. This patch is not a penetration test or a certification.

Official implementation references: [Vercel forwarding headers](https://vercel.com/docs/headers/request-headers), [Node authenticated encryption](https://nodejs.org/api/crypto.html), and the installed Next.js guides in `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` and `03-api-reference/03-file-conventions/proxy.md`.
