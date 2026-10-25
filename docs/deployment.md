# VibeAudit deployment guide

This guide prepares an existing Supabase project and an existing Vercel project for the VibeAudit MVP. It does not create projects or apply hosted migrations automatically. Keep all credentials in the relevant provider's secret environment settings.

## Supabase project setup

Use an existing Supabase project and enable Anonymous Sign-Ins in **Authentication → Sign In / Providers → Anonymous**. Copy its project URL and publishable key into the deployment environment. The application reads `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; it deliberately does not fall back to the legacy anon-key variable. Never use a service-role or secret key in browser code.

Install the repository-pinned CLI with `npm ci`. Authenticate using the official CLI login flow, link the existing project by its ref, and inspect migration status. Review a dry run before applying:

```sh
npx supabase login
npx supabase link --project-ref YOUR_EXISTING_PROJECT_REF
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
```

Do not run `db reset` against a hosted database. If dry-run shows unexpected changes or destructive SQL, stop and review the migration plan. The only initial migration is `supabase/migrations/001_initial_schema.sql`; it creates the VibeAudit tables, owner constraints, indexes, grants, RLS policies, idempotent save RPC, and AI usage RPC. Do not manually replay the SQL in the dashboard after the CLI has recorded it.

For local database verification, start Docker and run `npx supabase start` followed by `npx supabase test db`. A successful code build or mocked API test does not establish hosted RLS correctness. Confirm two-user isolation, child-row isolation, RPC owner binding, grants, cascades, and AI usage limits against Postgres before production use.

## Gemini

Set `GEMINI_API_KEY` only as a server environment variable in Vercel. Do not prefix it with `NEXT_PUBLIC_`, expose it in HTML, client bundles, API responses, or logs. The code pins a model ID in `src/lib/ai/constants.ts`; check it against Google's current [Gemini model catalog](https://ai.google.dev/gemini-api/docs/models) before release.

The app requires an authenticated Supabase session before the Gemini route can run. Keep the payload budget and the DB-backed per-user rate limit active. The current limit is one concurrent request and ten requests per user per hour; a missing/unapplied rate-limit migration blocks production Gemini use. Do not use full project source as a production test payload.

## Vercel environment and release checks

Configure these variables for the intended Vercel environments:

| Variable                               | Visibility                                                             |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Public project URL                                                     |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public client key; database access must be protected by grants and RLS |
| `GEMINI_API_KEY`                       | Secret server-only variable                                            |

Set the Node.js runtime to a version compatible with `package.json` (`>=24.11.0`). Confirm the deployed framework/runtime settings and verify production dependency audit, tests, typecheck, lint, formatting, and build before release.

Vercel's current Functions documentation lists a 4.5 MB request/response body cap, 2 GB default memory (up to 4 GB on Pro/Enterprise), and duration defaults/ceilings that depend on plan and Fluid Compute. VibeAudit's AI route allows at most 64 KiB of request JSON and 48,000 payload characters, well below the request-body cap. The route's 25-second Gemini timeout fits within the documented current defaults. Check the current [Functions limits](https://vercel.com/docs/functions/limitations) and [duration settings](https://vercel.com/docs/functions/configuring-functions/duration) for the selected account and project; platform plan settings can differ.

Production release gates:

- Hosted migration is applied and migration history is consistent.
- Anonymous auth, table grants, RLS, owner isolation, save idempotency, cascade deletion, and AI rate limiting have real Postgres verification.
- Production dependency audit has no unresolved critical/high runtime vulnerability.
- All local automated checks and the production build pass.
- All three environment variables are configured in the correct Vercel environments; only Gemini is secret.
- One small, sanitized Gemini request succeeds through the authenticated app flow, and its structured result passes schema validation.

## Post-deploy smoke test

On the production URL, verify home page load, anonymous session creation, folder selection and local audit, Rule score and coverage, the AI consent/error path, saving and loading History, Audit detail, resolved toggle without score mutation, and own-Audit deletion with child cascade. Use a disposable test project and remove its test audit afterward. Verify that a second account cannot read, update, or delete the first account's records. Inspect client HTML/JavaScript and server logs for credentials, source text, full prompts, or raw model responses. A publishable key in client code is expected; service-role/secret keys are not.

## Rollback and credential rotation

For an application regression, roll back to the last known-good Vercel deployment and disable or remove the affected server environment variable if needed. Do not reverse a schema migration by dropping tables or data. Prefer a forward-compatible corrective migration; take and verify a database backup before any planned destructive schema operation. If a credential is exposed, revoke/rotate it in its provider first, update the corresponding Vercel environment, and redeploy. Follow [Google API key best practices](https://ai.google.dev/gemini-api/docs/api-key) and [Supabase API key guidance](https://supabase.com/docs/guides/api/api-keys) for current provider procedures.
