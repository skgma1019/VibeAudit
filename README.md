# VibeAudit

VibeAudit is a browser-based quality audit dashboard for JavaScript, TypeScript, React, Next.js, and Node.js projects. It reads only files the user selects, analyzes them locally with static rules and relation extraction, and can send a bounded, redacted summary to Gemini for advisory insights.

## Architecture and features

- Next.js App Router and TypeScript provide the web application and server routes.
- The browser reads selected project files into memory and runs static relation analysis in a Web Worker. It never executes project code.
- The Rule Engine produces deterministic or heuristic findings and calculates the score. Gemini explains and contextualizes findings; AI-only insights do not reduce the score.
- Gemini calls run on the server. The request contains only bounded summaries and redacted evidence.
- Supabase Auth provides anonymous sessions. Postgres stores metadata, scores, redacted findings, locations, relations, and optional AI insights under owner-scoped RLS. Original source files, full prompts, and raw model responses are not persisted.

Supported project types are JavaScript, TypeScript, React, Next.js, and Node.js. Python, Java/Spring, GitHub URL analysis, ZIP upload, automatic code edits, and GitHub Actions are outside the MVP.

## Requirements and local setup

Use Node.js 24.11 or newer and npm. Run `npm install` for a local setup (use `npm ci` for a clean lockfile-reproducible install), then start the development server:

```sh
npm ci
npm run dev
```

Open <http://localhost:3000>. To run automated checks:

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

## Environment variables

Copy `.env.example` to `.env.local` and provide values locally. Never commit `.env.local` or place a Gemini key in a `NEXT_PUBLIC_` variable.

| Variable                               | Use                               |
| -------------------------------------- | --------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project URL              |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable client key   |
| `GEMINI_API_KEY`                       | Server-only Google Gemini API key |

The legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is not a supported fallback. Without Supabase configuration, local static analysis remains available while AI and persistent History are unavailable. Gemini requests require a valid authenticated session.

## Supabase setup

Create or use a Supabase project, enable Anonymous Sign-Ins in its Auth settings, then apply the checked-in migration:

```sh
npx supabase login
npx supabase link --project-ref YOUR_EXISTING_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

Inspect the dry-run before applying. Do not run a database reset against a hosted project. For local PostgreSQL/RLS tests, install and start Docker, then run:

```sh
npx supabase start
npx supabase test db
```

The pgTAP test covers owner isolation for the principal audit tables. Hosted verification and the current environment status are tracked in [TODO.md](./TODO.md). See [deployment guide](./docs/deployment.md) before configuring production.

## Privacy and limits

The folder picker is explicit. `.env` files, credentials, binaries, unsupported files, and detected secrets are excluded or redacted. Initial limits are 512 KiB per file, 10 MiB of text, and 1,000 files. Source is held only in browser memory during analysis and is not sent to Supabase. The server masks secret candidates again before forwarding the minimal AI payload. Secret detection cannot guarantee that every credential pattern will be recognized; review the AI disclosure before sending.

## Known limitations

Static relation extraction is intentionally conservative and reports unresolved or unsupported cases. Browser directory selection depends on browser support. Anonymous sessions do not provide account recovery across browser storage loss. Actual hosted Supabase, Gemini, and browser E2E checks require configured credentials and a connected browser; do not interpret unrun checks as passed.

## Deployment

See [docs/deployment.md](./docs/deployment.md) for environment setup, migration and RLS verification, release gates, smoke checks, and rollback guidance. Production deployment is blocked until the hosted migration, RLS, auth, protected Gemini usage, and production environment are verified.
