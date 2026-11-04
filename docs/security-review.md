# Security review and hardening — November 3, 2026

The source review covered authentication, user-owned APIs, Google OAuth/sync/webhooks, imported descriptions, calendar subscriptions, and dependencies. The application now includes the hardening described below, with a coordinated production rollout still required.

## Implemented

- Atomic PostgreSQL rate limits shared across app instances, fail-closed quota checks, hashed rate-limit identities, and retry hints.
- Origin/content-type checks for custom writes, bounded actual streamed request bodies, request validation, and bounded calendar queries/recurrences/results.
- AES-256-GCM encryption for Google access/refresh/ID tokens at all credential-write boundaries, authenticated user/field context, key rotation, and a resumable conversion script with compare-and-swap updates.
- Revocable 30-day database sessions with hashed random session tokens, disabled-user checks, and Sign out all devices.
- Per-user distributed sync/repair leases, Google request/operation timeouts, pagination/payload bounds, bounded database pools and query timeouts.
- Nonce-based production script CSP, HTTPS-only new image settings, remote database TLS verification, security headers, private/no-store feeds, and redacted server error logging/responses.
- Shared bounded event-range logic for the calendar API and subscription feeds, preserving DST behavior and recurring occurrence identities.

## Current deployment state

The additive database migration has been applied to the shared database. Local encryption is in **staged** mode because the existing production app cannot yet read encrypted credentials. The conversion dry run examined 5 Google accounts and found 11 plaintext token fields; it made zero updates. No production code or Vercel environment variables have been changed.

Complete [the coordinated rollout](./security-rollout.md) before claiming existing Google credentials are encrypted at rest. After every active app uses the new code/key and encrypted writes, convert existing credentials and require encrypted reads. The session strategy change signs existing browser sessions out once.

## Remaining limits

- This is a code review and implementation, not a penetration test.
- Hosting IAM, actual production environment values, database roles/backups, log retention, key backup/recovery, and old deployment access still require operational verification.
- User-chosen HTTPS images still contact their external hosts. A trusted image upload/proxy design would be a separate feature.
- Ordinary API quota enforcement adds database queries. Review thresholds and monitor 429/503s after rollout; edge DDoS protection remains the hosting provider's responsibility.
- The latest production dependency audit reports zero known vulnerabilities. Development-tooling advisories remain and require compatible upstream updates rather than forced major downgrades.
- Repository-wide lint still reports the three existing effect-related errors and seven existing warnings; no new lint findings were introduced by the security work.

## Verification

- 42 test suites / 227 tests passed, including atomic quota/lease integration tests against PostgreSQL-compatible PGlite, encrypted refresh/CAS tests, session revocation, CSP nonces, malformed/oversized payloads, recurrence bounds, and existing calendar regressions.
- TypeScript and the production Webpack build passed.
- Local HTTP smoke checks returned 200 for the anonymous session endpoint, 401 for a private API without a session, and 403 for a cross-origin mutation. The database-backed quota ran against the shared database during those checks.
- The local sign-in page returned a CSP nonce matching all 20 rendered script tags and loaded in the browser. A full Google login/sync check remains part of the coordinated production rollout.
- The migration dry run succeeded with explicit TLS certificate verification and made no credential changes.
