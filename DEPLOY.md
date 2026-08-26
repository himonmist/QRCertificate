# Deploying to Vercel

QRCertificate is a Next.js app with a Postgres database and (in production) Blob-based file storage — both required because Vercel's serverless functions have no persistent local filesystem between invocations. This guide gets a working deployment at `https://<your-project>.vercel.app`.

## 1. Push the repo to GitHub

Already done if you're reading this from `himonmist/QRCertificate`.

## 2. Import the project on Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import `himonmist/QRCertificate`.
2. Vercel auto-detects Next.js — leave the build settings as default.
3. **Don't deploy yet** — set up the database and env vars first (steps 3–4), or the first build will fail on `prisma migrate deploy`.

## 3. Add a Postgres database

In the Vercel project → **Storage** tab → **Create Database** → choose **Postgres** (Neon-backed). This automatically sets a `DATABASE_URL` (and a few related vars) in your project's environment variables for all environments (Production/Preview/Development).

Any other managed Postgres works too (Neon, Supabase, Railway, etc.) — just set `DATABASE_URL` yourself in step 4 instead.

## 4. Add Blob storage (for trainer signatures / template backgrounds)

Same **Storage** tab → **Create Database** → choose **Blob**. This auto-injects `BLOB_READ_WRITE_TOKEN`. Without this, image uploads fall back to writing to local disk, which **will not persist** on Vercel — uploaded signatures/logos would vanish and likely 404 on the very next request (a different serverless instance).

## 5. Set the remaining environment variables

In **Settings → Environment Variables**, add (for Production, and Preview if you want preview deploys to work too):

| Variable | Value |
|---|---|
| `SESSION_SECRET` | Output of `openssl rand -hex 32` |
| `CERT_HASH_SECRET` | Output of a *different* `openssl rand -hex 32` — never reuse the session secret |
| `NEXT_PUBLIC_APP_URL` | `https://<your-project>.vercel.app` (or your custom domain). Must exactly match the deployed origin — it's baked into every certificate's QR code. |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Only needed once, to run the seed script (step 7) |

`DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` are already set from steps 3–4.

## 6. Deploy

Trigger a deploy (push to the connected branch, or click **Deploy** in the dashboard). The build runs `prisma migrate deploy` automatically (see `package.json`'s `build` script) before `next build`, applying the schema to your new database.

## 7. Create the first admin account

The app ships with no admin accounts and no signup page (only a super admin can create more, and there's no admin-management UI yet — see README.md's scope notes). Run the seed script once, pointed at your production database:

```bash
DATABASE_URL="<paste your production DATABASE_URL>" \
SEED_ADMIN_EMAIL="you@example.com" \
SEED_ADMIN_PASSWORD="something-long-and-random" \
npx tsx prisma/seed.ts
```

Run this from your machine (with the repo cloned and `npm install` run) — not as part of the Vercel build, since it should only ever run once. Change the password after first login isn't implemented yet either; treat this seed value as the real production password, or re-run the seed with a new one (it only skips if that exact email already has a row — deleting it and re-running is one option if you need to rotate).

## 8. Verify it worked

Visit `https://<your-project>.vercel.app/login`, sign in, create a trainer/program/participant, and generate a certificate. Then open its `/verify/<certificate-id>` URL in a private/incognito window (no login) to confirm public verification works.

## Known gaps specific to a serverless deployment

- **Rate limiting is effectively best-effort on Vercel.** `src/lib/rateLimit.ts` is an in-process `Map` — each serverless invocation can land on a different instance with its own memory, so the login/public-verify rate limits only bite within a single warm instance's burst of traffic, not globally. This does not reopen any of the app's actual trust guarantees (the certificate hash check, auth, CSRF) — it only weakens brute-force/scraping throttling. For real production traffic, replace `RateLimiter` with a shared store (Vercel KV / Upstash Redis) — the interface (`check(key)`) is small enough to swap the implementation without touching call sites. Consider also enabling Vercel's Firewall rate-limiting rules at the edge as a complementary layer.
- **Bulk certificate generation runs synchronously** in the request (`maxDuration = 60` is set on that route to give it headroom on Vercel, but very large programs — hundreds of participants — should move to a background job/queue instead of raising this further).
- **Trainer signature / template background images degrade gracefully but silently** if the referenced Blob URL becomes unreachable (network blip, storage misconfiguration): the certificate still renders, just without that image, per `renderCertificatePdf`'s try/catch. Worth monitoring if this matters to you.
