# Deploy Plan: typer-sportowy → Cloudflare Workers

Audit trail of the first production deployment. Consumed downstream by milestone-planning skills as ground truth for "what's already deployed and which secrets are already wired" (per `.github/copilot-instructions.md`).

- **Date executed**: 2026-09-08
- **Platform decision source**: `context/foundation/infrastructure.md` (Cloudflare Workers, recommended over Railway/Render/Netlify/Vercel/Fly.io)
- **Tech stack source**: `context/foundation/tech-stack.md` (Astro 6 SSR, React 19, TypeScript, Supabase)

## What was done

| Step | Result |
|---|---|
| Cloudflare account | Existing account, `patrykshon@o2.pl`, Account ID `c74229308eb2813558d4f0daca867db9` |
| Wrangler CLI auth | `wrangler login` (OAuth) — no scoped API token used for this manual run |
| Git repository | Initialized locally, pushed to `https://github.com/Nesfitus/10x-dev-projekt` (branch `main`) |
| Worker name | `wrangler.jsonc` renamed from default `10x-astro-starter` to `typer-sportowy` |
| Custom domain / zone | None — using default `*.workers.dev` subdomain. Auto Minify (zone-level setting) is therefore not applicable; **revisit if a custom domain is ever attached** |
| Production secrets | `SUPABASE_URL`, `SUPABASE_KEY` set via `wrangler secret put` (values never entered in chat) |
| workers.dev subdomain | Registered one-time via Cloudflare onboarding flow (was a hard blocker on first `wrangler deploy` attempt) |
| First manual deploy | `npm run build` + `npx wrangler deploy` → **https://typer-sportowy.patrykshon.workers.dev**, version `13e6a5b0-3151-438b-bf80-f323d3e26f47` |
| Smoke test | `/`, `/auth/signin`, `/auth/signup` all returned `200 OK` |
| CPU-time measurement | `wrangler tail` showed a **cold request at 22ms CPU** (exceeds the Free tier's 10ms cap) vs warm requests at 4–6ms |
| Pricing tier decision | **Stayed on Free tier** — risk consciously accepted despite the measured cold-start overage. Revisit if 500 errors appear in production (see Risks below) |
| Auto-deploy | **Cloudflare Workers Builds** connected to `Nesfitus/10x-dev-projekt` (branch `main`) via the Cloudflare dashboard (native git integration, GitHub App install) |
| Build config (Workers Builds) | Build command: `npm run build` · Deploy command: `npx wrangler deploy` · Version command: `npx wrangler versions upload` · Root directory: `/` |
| `.github/workflows/ci.yml` | **Unchanged** — still lint + build only. Deploy is owned exclusively by Workers Builds, avoiding two systems deploying in parallel |
| Auto-deploy verification | Fixed a stale `wrangler.jsonc` name mismatch on GitHub (was still `10x-astro-starter`), pushed the fix, then pushed an empty commit to `main` → Workers Builds auto-triggered a build+deploy → new version `72e6c7ca-d3bb-4c95-b3da-16ea47c300ef` went live, site verified `200 OK` |

## Current operational state

- **Live URL**: https://typer-sportowy.patrykshon.workers.dev
- **Pricing tier**: Free (100k req/day, 10ms CPU/invocation cap)
- **Secrets configured**: `SUPABASE_URL`, `SUPABASE_KEY` (production, via `wrangler secret put`)
- **Auto-deploy**: push to `main` on `Nesfitus/10x-dev-projekt` → Cloudflare Workers Builds → live in ~1 minute
- **Rollback path**: `npx wrangler rollback` (reverts Worker code/version only — does not revert any Supabase schema migration; not currently a concern since this project has no migrations yet, auth-only via `auth.users`)
- **Manual approval gates that remain**: any future `wrangler secret put` (secret rotation), switching pricing tier, and any destructive Cloudflare dashboard action

## Risks carried forward (from `infrastructure.md`, now with empirical evidence)

| Risk | Status |
|---|---|
| Free-tier 10ms CPU cap causing intermittent 500s on auth/SSR routes | **Confirmed measurable** — cold request hit 22ms CPU during smoke test. Currently accepted; monitor production for actual 500s. Mitigation ready: switch to Paid ($5/mo) via Cloudflare dashboard, no code change needed. |
| `wrangler rollback` doesn't revert Supabase schema changes | Not yet applicable (no migrations exist). Revisit the first time a migration ships alongside a deploy. |
| Adapter (`@astrojs/cloudflare@13.5.0`) one generation behind Astro 7-compatible 14.x | Unchanged from research — no action needed now, track before the next major Astro upgrade. |
| Auto Minify hydration bug | Not applicable — no custom domain/zone attached yet. Re-check if a custom domain is added later. |

## Deviations from the original plan

- The original plan assumed a possible non-interactive CLI token setup; in practice, interactive `wrangler login` (OAuth) was used since this was a one-time manual deploy, not a CI pipeline.
- `git push` initially failed with a 403 (collaborator permissions not yet granted on the GitHub repo) — resolved by the user adding collaborator access before retrying.
- A stale `wrangler.jsonc` name value was pushed in the initial commit before the Faza 2 rename was committed — caught via a Cloudflare dashboard warning during Workers Builds setup, fixed with a follow-up commit.
