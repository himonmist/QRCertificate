# QRCertificate

A QR-verified training certificate generation platform. A training organization manages trainers, programs, and participants, and bulk-generates tamper-evident certificates with a permanent public verification link and QR code.

Built with Next.js 14 (App Router, TypeScript), Prisma + SQLite, `pdf-lib`, and `qrcode`, following a test-driven approach for every trust-critical code path (certificate id/hash generation, auth, rate limiting, revoke/reissue, public verification).

## Features implemented

- **Trainer management**: profile, digital signature upload (PNG/JPEG/WEBP, 2MB max), active/inactive status.
- **Training program management**: category, organizer/sponsor/issuer, trainer assignment (chief trainer / trainer), dates, location.
- **Participant management**: single add + CSV/XLSX bulk import with row-level validation, duplicate-email detection, and a dry-run preview before committing.
- **Certificate generation engine**: bulk-generates a unique certificate id (`PREFIX-YEAR-PROGRAMCODE-000001`), a QR code encoding a permanent verification URL, a print-ready PDF, and a SHA-256 tamper-evidence hash (data + server-only secret salt) — idempotent per participant.
- **Public verification portal**: `/verify` (manual lookup) and `/verify/[uid]` (QR target), no login required, shows Valid/Invalid/Revoked/Superseded states, rate-limited and logged.
- **Admin dashboard**: stats, certificate search/filter, revoke (with reason), reissue (supersession chain), audit log of every mutation.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Prisma ORM + SQLite
- `bcryptjs` (password hashing), `jose` (session JWTs)
- `qrcode`, `pdf-lib`
- `papaparse` / `xlsx` for bulk import
- Vitest for unit + integration tests

## Getting started

```bash
npm install
cp .env.example .env        # fill in real secrets — see below
npx prisma migrate dev      # creates prisma/dev.db
npx tsx prisma/seed.ts      # creates the bootstrap super admin from SEED_ADMIN_EMAIL/PASSWORD
npm run dev                 # http://localhost:3000
npm test                    # run the full test suite
npm run build               # production build
```

Required environment variables (see `.env.example`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite file path |
| `SESSION_SECRET` | Signs admin session JWTs — generate with `openssl rand -hex 32` |
| `CERT_HASH_SECRET` | Secret salt mixed into every certificate's verification hash — generate the same way, **never reuse across environments** |
| `NEXT_PUBLIC_APP_URL` | Public base URL used to build the QR verification link |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | One-time bootstrap super admin (seed script only) |

## Architecture notes / scope decisions

This was built to demonstrate the full trust chain (issue → QR/PDF → tamper-evident hash → public verify → revoke/reissue) with strong test coverage and a hardened admin surface, within a reasonable build. A few things are deliberately out of scope for this pass, called out here rather than silently skipped:

- **No drag-and-drop template designer.** `certificate_templates.layoutJson` is a JSON document of field coordinates (see `src/lib/certificateLayout.ts` for the schema and default layout); the admin UI edits it as raw JSON. A visual designer is a natural follow-up.
- **No outbound email.** Certificates are generated and downloadable (admin-authenticated and, for active certificates, via the public verify page); auto-emailing on generation is not wired up. `src/lib/certificateService.ts` is the integration point.
- **No admin-user management UI.** Only login/logout are implemented; additional admins are created via `prisma/seed.ts` or directly in the database. Super Admin vs Admin roles exist in the schema and are enforced by middleware, but there's no `/admin/admins` CRUD screen yet.
- **Certificate generation runs synchronously** in the request (fine for the "modest scale" case the spec allows); a queue (BullMQ) is the documented next step for hundreds-of-certificates batches.
- **Rate limiting is in-process** (single Node instance). Behind multiple replicas this needs a shared store (Redis) — see `src/lib/rateLimit.ts`.

See `SECURITY.md` for the security model and what was verified.

## Testing approach (TDD)

Every trust-critical library was written test-first: `tests/unit/*.test.ts` cover `crypto.ts` (hash tamper-evidence), `certificateId.ts` (id format + collision-scope), `auth.ts` (password hashing, JWT expiry/tampering), `rateLimit.ts`, `validation.ts`, `bulkImport.ts`, and `pdf.ts`. `tests/integration/*.test.ts` exercise the real Next.js route handlers against a real (temporary) SQLite database for auth, CRUD, certificate generation/revoke/reissue, and public verification (including a caught-and-fixed certificate-uid collision bug and a tamper-detection case). Run with `npm test`.
