# QRCertificate

A QR-verified training certificate generation platform. A training organization manages trainers, programs, and participants, and bulk-generates tamper-evident certificates with a permanent public verification link and QR code.

Built with Next.js 14 (App Router, TypeScript), Prisma + Postgres, `pdf-lib`, and `qrcode`, following a test-driven approach for every trust-critical code path (certificate id/hash generation, auth, rate limiting, revoke/reissue, public verification). Designed to run on a serverless host (Vercel) — see `DEPLOY.md`.

## Features implemented

- **Trainer management**: profile, digital signature upload (PNG/JPEG/WEBP, 2MB max), active/inactive status.
- **Training program management**: category, organizer/sponsor/issuer, trainer assignment (chief trainer / trainer), dates, location.
- **Participant management**: single add + CSV/XLSX bulk import with row-level validation, duplicate-email detection, and a dry-run preview before committing.
- **Certificate generation engine**: bulk-generates a unique certificate id (`PREFIX-YEAR-PROGRAMCODE-000001`), a QR code encoding a permanent verification URL, a print-ready PDF, and a SHA-256 tamper-evidence hash (data + server-only secret salt) — idempotent per participant. The PDF and QR are rendered **on demand** from a snapshot frozen at issuance (see below), not written to disk — required for serverless, where local disk doesn't persist between requests.
- **Public verification portal**: `/verify` (manual lookup) and `/verify/[uid]` (QR target), no login required, shows Valid/Invalid/Revoked/Superseded states, rate-limited and logged.
- **Admin dashboard**: stats, certificate search/filter, revoke (with reason), reissue (supersession chain), audit log of every mutation.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Prisma ORM + Postgres
- `bcryptjs` (password hashing), `jose` (session JWTs)
- `qrcode`, `pdf-lib`
- `@vercel/blob` for image uploads (falls back to local disk when unset, for local dev)
- `papaparse` / `xlsx` for bulk import
- Vitest for unit + integration tests

## Getting started (local dev)

Requires a local Postgres instance (`createdb qrcertificate` or equivalent).

```bash
npm install
cp .env.example .env        # fill in real secrets — see below
npx prisma migrate dev      # applies the schema to your local Postgres
npx tsx prisma/seed.ts      # creates the bootstrap super admin from SEED_ADMIN_EMAIL/PASSWORD
npm run dev                 # http://localhost:3000
npm test                    # run the full test suite (spins up a throwaway *_test database)
npm run build               # production build (also runs `prisma migrate deploy`)
```

Required environment variables (see `.env.example`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `SESSION_SECRET` | Signs admin session JWTs — generate with `openssl rand -hex 32` |
| `CERT_HASH_SECRET` | Secret salt mixed into every certificate's verification hash — generate the same way, **never reuse across environments** |
| `NEXT_PUBLIC_APP_URL` | Public base URL used to build the QR verification link |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | One-time bootstrap super admin (seed script only) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token for image uploads — required in production, optional locally (falls back to `public/uploads/`) |

## Deploying

See **`DEPLOY.md`** for step-by-step Vercel setup (Postgres + Blob storage provisioning, env vars, running the seed script against production).

## Architecture notes / scope decisions

This was built to demonstrate the full trust chain (issue → QR/PDF → tamper-evident hash → public verify → revoke/reissue) with strong test coverage and a hardened admin surface, within a reasonable build. A few things are deliberately out of scope for this pass, called out here rather than silently skipped:

- **No drag-and-drop template designer.** `certificate_templates.layoutJson` is a JSON document of field coordinates (see `src/lib/certificateLayout.ts` for the schema and default layout); the admin UI edits it as raw JSON. A visual designer is a natural follow-up.
- **No outbound email.** Certificates are generated and downloadable (admin-authenticated and, for active certificates, via the public verify page); auto-emailing on generation is not wired up. `src/lib/certificateService.ts` is the integration point.
- **No admin-user management UI.** Only login/logout are implemented; additional admins are created via `prisma/seed.ts` or directly in the database. Super Admin vs Admin roles exist in the schema and are enforced by middleware, but there's no `/admin/admins` CRUD screen yet.
- **Certificate generation runs synchronously** in the request (fine for the "modest scale" case the spec allows, and given headroom via `maxDuration` on Vercel); a queue (BullMQ) is the documented next step for hundreds-of-certificates batches.
- **Rate limiting is in-process** and materially weaker on a multi-instance serverless deployment than on a single long-running server — see `DEPLOY.md`'s "Known gaps" section and `src/lib/rateLimit.ts`.
- **Trainer signature / template background images are looked up live** at PDF-render time (not frozen in the issuance snapshot below), so replacing one after certificates were issued does change how older certificates render. Text fields don't have this gap — see SECURITY.md.

See `SECURITY.md` for the security model and what was verified.

## How a certificate stays "permanent"

Two separate mechanisms back the spec's requirement that a certificate's verification page and content must never change once issued, even if an admin edits the underlying program/participant record afterward:

1. **`verificationHash`** (SHA-256 of `{certificateUid, participantId, programId, issuedAt}` + a server-only secret) proves the certificate *record itself* hasn't been tampered with or fabricated.
2. **`renderedSnapshotJson`** freezes every *displayed* field (participant name, program title, organizer, trainer, dates, location) at the moment of issuance. The PDF, QR, and public verify page all render from this snapshot — never from a live join to the `Participant`/`TrainingProgram` tables — so a later correction to a program's title, for example, can't silently rewrite what an already-issued certificate shows. `reissueCertificate` is the one place that intentionally re-snapshots current data, since a reissue is often *because* something needed correcting.

This was tightened while adapting the app for serverless deployment (PDF rendering moved from "render once, save to disk" to "render on demand from stored data"), and is covered by `tests/integration/certificates-api.test.ts`'s "keeps an already-issued certificate's displayed data frozen..." test.

## Testing approach (TDD)

Every trust-critical library was written test-first: `tests/unit/*.test.ts` cover `crypto.ts` (hash tamper-evidence), `certificateId.ts` (id format + collision-scope), `auth.ts` (password hashing, JWT expiry/tampering), `rateLimit.ts`, `validation.ts`, `bulkImport.ts`, `pdf.ts`, `middleware.ts` (CSP/CSRF/auth), `storage.ts`, and `imageUrl.ts` (upload trust boundary). `tests/integration/*.test.ts` exercise the real Next.js route handlers against a real (temporary) Postgres database for auth, CRUD, certificate generation/revoke/reissue, and public verification. Run with `npm test`.

Bugs caught this way before shipping (not by inspection): a cross-program certificate-uid collision, a path-traversal hole in template backgrounds, a CSP that silently broke all client-side JS in the browser, and the live-data snapshot gap described above.
