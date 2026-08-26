# Security Model

## Authentication & sessions

- Admin passwords are hashed with `bcryptjs` (cost factor 12, salted per-password) — `src/lib/password.ts`.
- Sessions are stateless JWTs (`jose`, HS256) signed with `SESSION_SECRET`, stored in an `httpOnly`, `SameSite=Lax` cookie, `secure` in production, 8-hour expiry — `src/lib/sessionToken.ts`, `src/lib/session.ts`.
- `src/middleware.ts` verifies the session on every `/admin/*` page and `/api/*` route (except `/api/auth/login` and `/api/public/*`), and stamps the verified `adminId`/`role` onto trusted `x-admin-id`/`x-admin-role` request headers for route handlers to read — **any client-supplied values for those exact header names are stripped first**, so a request cannot spoof its own identity.
- Login responses are identical (`"Invalid email or password"`, same status) whether the email doesn't exist or the password is wrong, and a fixed dummy bcrypt hash is compared on unknown-email attempts, to resist user enumeration by content or gross timing.
- Login attempts are rate-limited per IP (`src/lib/rateLimit.ts`).

## CSRF

Since admin auth is cookie-based, state-changing requests (`POST`/`PUT`/`PATCH`/`DELETE`) to any non-public API route are rejected in middleware unless their `Origin` header matches the app's own origin. Verified live: a cross-origin `POST` with a cookie returns `403`.

## Certificate integrity (the core trust guarantee)

- Every certificate stores a `verificationHash` = `SHA-256(canonicalized certificate data + CERT_HASH_SECRET)` (`src/lib/crypto.ts`). The secret never leaves the server, so a certificate row cannot be fabricated or edited to pass verification without it.
- The public verify endpoint (`/api/public/verify/:uid`, and the `/verify/[uid]` page that shares the same code path) recomputes and compares the hash on every lookup and reports `status: "invalid"` on mismatch, using a timing-safe comparison (`timingSafeEqual`).
- Certificates are **never deleted**: `revoke` and `reissue` only change `status` (`active` → `revoked`/`superseded`), so a QR code keeps resolving forever, per the spec's permanence requirement.
- Certificate ids are validated against a strict format allowlist (`isValidCertificateUidFormat`) *before* any database or filesystem lookup, closing off path-traversal-shaped input (e.g. `../../etc/passwd`) at the door.
- **Found and fixed during review**: `POST /api/templates` accepted an arbitrary string for `backgroundUrl`, which was later joined onto a filesystem path and read to embed as the certificate background (`src/lib/certificateService.ts`). A `backgroundUrl` like `../../../../etc/some-file` would have been read from disk and embedded into a certificate PDF — one served *without authentication* via `/api/public/verify/:uid/pdf` to anyone holding the certificate UID (which isn't secret; it's printed on the certificate). Fixed by (a) restricting `backgroundUrl` in `templateInputSchema` to the exact `/uploads/<category>/<filename>.<ext>` shape produced by the image upload endpoints, and (b) adding `resolvePublicUploadPath()` in `src/lib/storage.ts`, which resolves the path and verifies it stays under `public/uploads/` before any read is attempted, as defense-in-depth. Covered by `tests/unit/storage.test.ts` and `tests/unit/validation.test.ts`.
- Sequence numbers for certificate ids are scoped to the full `prefix-year-programCode` combination (not the internal program row id) — an earlier version of this scoped sequences per-program instead, which a test caught: two programs that happen to produce the same human-readable code would have collided on the same certificate id. Fixed and covered by `tests/unit/certificateId.test.ts` and `tests/integration/certificates-api.test.ts`.

## File uploads

- Signature/logo uploads (`src/lib/storage.ts`) are restricted to `image/png`, `image/jpeg`, `image/webp`, capped at 2MB, and written under a **server-generated random filename** (never the client-supplied name) — the client-provided name is never used to construct a path, so it cannot escape the upload directory.
- Bulk participant import files are capped at 5MB and parsed as CSV/XLSX only; every row is validated with `zod` before any database write.

## Security headers

Set on every request in `src/middleware.ts`: `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, restrictive `Permissions-Policy`.

`script-src` uses a fresh per-request nonce + `'strict-dynamic'` in production (Next.js's documented App Router CSP pattern — it auto-applies the nonce to the script tags it renders), with `'unsafe-eval'`/`'unsafe-inline'` allowed only outside production, since Next's dev-mode Fast Refresh runtime uses `eval()`.

**Found and fixed during review — this one slipped past all 65 passing tests and was only caught by manually driving the app in a real browser**: the first version of this CSP shipped a static `script-src 'self'` with no nonce, no `'unsafe-eval'`, no `'strict-dynamic'`. That's stricter-looking but wrong for a Next.js app — Next's client runtime couldn't execute *at all* under it. Every test in the suite talks to route handlers directly, so nothing exercised the browser's actual CSP enforcement; the failure mode was also silent (no thrown error a test could catch) — the login form just fell back to a native HTML form GET submission with the credentials in the URL, and every other client-side interaction on the site would have been equally broken. Fixed by moving CSP generation into `src/middleware.ts` with the nonce/strict-dynamic pattern above, and covered going forward by `tests/unit/middleware.test.ts`, which asserts the production CSP has no `unsafe-eval`/`unsafe-inline` in `script-src` and the dev CSP does. Still worth a manual click-through after any further CSP change — this class of bug is specifically the kind unit/integration tests calling route handlers directly cannot see.

## Rate limiting & abuse resistance

- Public verification (`publicVerifyRateLimiter`) and login (`loginRateLimiter`) are both rate-limited per client IP (`src/lib/rateLimit.ts`), covering the spec's "rate-limit the public verify endpoint against scraping/enumeration" requirement.
- Verification scans are logged (`verification_logs`) with a SHA-256 hash of the client IP rather than the raw address, and a truncated user-agent — enough for abuse analytics without storing raw visitor IPs.
- **Known limitation**: the limiter is in-process (per Node instance). A multi-replica deployment needs a shared store (e.g. Redis) for the limit to hold across instances — this does not weaken correctness on a single instance, but is worth calling out before scaling horizontally.

## Authorization boundaries

- Trainers cannot be newly assigned to a program once marked `inactive` (enforced server-side in `POST /api/programs/:id/trainers`), while certificates already issued under a since-deactivated trainer remain valid, per the spec.
- Participants with any issued certificate cannot be deleted (`DELETE /api/participants/:id` returns `409`) — certificate/participant history is never silently broken.
- Every mutation (create/update/revoke/reissue/bulk-import/login/logout) is written to `audit_logs` with the acting admin's id.

## What was verified, not just written

All of the above was exercised against a real (temporary) SQLite database via Vitest integration tests that call the actual Next.js route handlers — not mocked — including: unauthenticated requests being rejected, duplicate-email conflicts, tamper detection (hash mismatch → `invalid`), revoke/reissue state transitions, and rate-limit enforcement after 30+ requests. The full suite (65 tests) is run with `npm test`. The build was also run end-to-end manually against a live dev server: login, trainer/program/participant creation, certificate generation, QR/PDF output, and public verification all confirmed working, alongside the security headers, auth redirect, and CSRF rejection.

## Known dependency vulnerabilities (`npm audit`)

- **`next@14.2.x`**: several published advisories (DoS via Server Components/Server Actions, request smuggling in rewrites, SSRF in rewrites/Server Actions, cache poisoning) apply to the 14.x line generally; the only fix path per `npm audit` is a major upgrade to Next 16, which is a breaking change not attempted in this pass to avoid shipping an unvalidated framework migration alongside the feature work. Track and schedule this upgrade separately, then re-run the full test suite and a manual smoke test.
- **`xlsx` (SheetJS)**: no fix currently available upstream for a prototype-pollution and ReDoS advisory. Exposure here is limited to admin-uploaded `.xlsx` bulk-participant files (`POST /api/programs/:id/participants/bulk`) — not reachable by unauthenticated users — but a malicious `.xlsx` from a lower-privileged Admin/Program Coordinator account could still trigger it. If this is a concern for your deployment, restrict bulk import to `.csv` only, or swap in a maintained alternative when one exists.

## Out of scope for this pass

- No admin account lockout beyond IP-based rate limiting (no per-account lockout/backoff).
- No 2FA for admin accounts.
- No dependency vulnerability scanning wired into CI (run `npm audit` periodically).
- No secrets manager integration — secrets are read from environment variables (`.env`, excluded from git via `.gitignore`); deploy with your platform's secret store rather than committing a populated `.env`.
