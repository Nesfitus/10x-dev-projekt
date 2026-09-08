---
project: typer-sportowy
researched_at: 2026-09-08
recommended_platform: Cloudflare Workers
runner_up: Railway
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 (SSR) + React 19
  runtime: Cloudflare Workers (workerd)
---

## Recommendation

**Deploy on Cloudflare Workers.**

The project already ships with `@astrojs/cloudflare@13.5.0` and `wrangler.jsonc` configured — this pairing is explicitly supported by the adapter's own changelog (requires Astro ≥6.3.0, matching the project's `astro@^6.3.1`). Cloudflare scored a full pass on all five agent-friendly criteria (CLI-first, managed/serverless, agent-readable docs, stable deploy API, MCP integration), has zero migration cost, and its free tier (100k requests/day) is very likely sufficient for a solo-office tool used by a few dozen colleagues. The developer explicitly confirmed a preference for Cloudflare per prior course guidance, and the anti-bias cross-check surfaced manageable risks rather than blockers.

## Platform Comparison

Hard filters: none applied — no persistent connections/WebSockets required (interview Q1), so serverless-only platforms (Vercel, Netlify) remain eligible. All six platforms can technically run the tech stack, though four of six would require swapping the Astro adapter away from `@astrojs/cloudflare`.

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| **Cloudflare** | Pass | Pass | Pass | Pass | Pass | 5 Pass |
| **Railway** | Pass | Pass | Pass | Pass | Pass | 5 Pass |
| Render | Partial | Pass | Pass | Partial | Pass | 3 Pass / 2 Partial |
| Netlify | Partial | Pass | Pass | Partial | Pass | 3 Pass / 2 Partial |
| Vercel | Pass | Pass | Pass | Partial | Partial | 3 Pass / 2 Partial |
| Fly.io | Partial | Partial | Pass | Partial | Pass | 2 Pass / 3 Partial |

- **Cloudflare** — `wrangler deploy` / `wrangler rollback` / `wrangler tail` are all GA and deterministic. `llms.txt` published per product. Official GA remote MCP servers (docs, bindings, builds, observability). Already integrated in this repo — zero switching cost.
- **Railway** — Matches Cloudflare on every criterion: `railway up`/`redeploy`/`logs` are GA, `docs.railway.com/llms.txt` is published, and a hosted MCP server exists at `mcp.railway.com`. Requires swapping to `@astrojs/node` (a dedicated official Astro guide exists) and carries real usage-based billing (~$5/mo Hobby) even at low traffic.
- **Render** — Native Node/Bun runtime, no Dockerfile required, dedicated first-party Astro deploy guide. Rollback is Dashboard/API only (not a native CLI subcommand), and the free tier spins down after 15 minutes of inactivity (~60s cold start on next request) — a poor fit for sporadic office-hours usage.
- **Netlify** — GA MCP server and `llms.txt`, but the CLI has no dedicated rollback command (UI/API only), and the default function region is US-only unless on a paid plan — added latency for a non-US audience.
- **Vercel** — Excellent agent-readable docs (GA `llms.txt`) but two real gotchas: the latest `@astrojs/vercel` requires Astro 7 (incompatible — must manually pin `@astrojs/vercel@10.0.8`), and the free Hobby plan's Fair Use Guidelines restrict it to "non-commercial, personal use only," which is a gray area for an internal company tool. MCP is Public Beta, not GA.
- **Fly.io** — No free tier since 2024, mandatory Dockerfile (no buildpack path), and "Managed Postgres" is explicitly documented as feature-incomplete. Its core strength (always-on persistent processes) isn't needed since the app is stateless request/response.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Already the incumbent: adapter and `wrangler.jsonc` are in place, CI already expects `SUPABASE_URL`/`SUPABASE_KEY` as repository secrets in the Wrangler-compatible pattern. Full pass across all five criteria, a genuinely free tier for this traffic level, and official GA MCP servers for docs/bindings/observability. The path of least resistance for a solo, 3-week, after-hours MVP with no tooling budget.

#### 2. Railway

Scored identically to Cloudflare on the five criteria and has the best-documented migration path of the alternatives (an official Astro + `@astrojs/node` guide, GA MCP server, native rollback via `railway redeploy`/dashboard within a 72h retention window). The tradeoff is a real, ongoing dollar cost (~$5/mo Hobby plan plus usage) even at near-zero traffic, plus the one-time adapter migration effort — worth it only if Cloudflare's CPU-time limits or workerd quirks become a real blocker.

#### 3. Render

A native-runtime alternative to Railway that avoids Dockerfile entirely and ships a first-party Astro deployment guide. Held back by a CLI that can't roll back deployments natively (Dashboard/API only) and a free-tier cold start (~60s after 15 minutes idle) that would be noticeable for a tool used sporadically during office hours — the $7/mo Starter plan avoids this but adds cost the other two options don't strictly require.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. The free tier's 10ms CPU-time cap per invocation is a real risk: Cloudflare's own guidance puts SSR + auth workloads at 10–20ms CPU, meaning exactly the routes that matter most (login, point calculation) are the ones most likely to hit the cap.
2. The installed adapter (`@astrojs/cloudflare@13.5.0`) is already one generation behind current (14.x requires Astro 7) — future Astro upgrades will require a coordinated adapter + wrangler bump rather than a simple `npm update`.
3. `workerd` is a non-standard JS runtime; npm packages with native bindings or unexpected Node API usage can fail at runtime without a build-time warning. No Astro-specific confirmation was found that `@supabase/ssr`/`@supabase/supabase-js` at the exact pinned versions have been tested on `workerd` — only cross-project (non-Astro) evidence exists.
4. Debugging is harder than on a standard Node host — `wrangler tail` can silently drop (sample) log lines under higher traffic, and stack traces are sometimes less complete than in a local Node process.
5. Cloudflare's dashboard-level "Auto Minify" setting can silently break React hydration — a configuration pitfall that lives outside the repository and is easy to enable accidentally "for performance."

### Pre-Mortem — How This Could Fail

Six months in, the team (a single developer working after hours) assumed "workerd is basically Node" and never load-tested `@supabase/ssr` under real conditions. A few weeks after launch, the login endpoint started intermittently returning 500s — it was hitting the free tier's 10ms CPU cap on cold-cache auth requests. Because nobody had proactively switched to the $5/mo paid tier ("free tier is surely enough for a dozen people"), the issue only surfaced once the office started using the tool more than expected. Separately, because the adapter had been pinned to an older generation and nobody was tracking Cloudflare's changelog, a routine Astro upgrade months later turned into a bigger-than-expected migration requiring simultaneous Astro, adapter, and wrangler version bumps. To make things worse, someone enabled Cloudflare's "Auto Minify" in the dashboard "for performance," quietly breaking hydration on the login form for a week before anyone connected the symptom to the cause.

### Unknown Unknowns

- The `nodejs_compat` compatibility flag's default behavior is tied to the `compatibility_date` set in `wrangler.jsonc` — it's easy to be unknowingly stuck on old behavior if that date is never refreshed.
- Cloudflare now actively steers new projects toward Workers over Pages — anyone searching for "Cloudflare Pages" tutorials in the future may land on soft-deprecated guidance.
- `wrangler rollback` reverts the deployed Worker code/version but does **not** roll back any Supabase schema migration that shipped alongside it — a code rollback paired with a schema change can leave the app in an inconsistent state.
- CPU-time limits are per-invocation, not per-total-request — complex SSR pages with many React islands can accumulate CPU time in ways that are hard to predict without an actual load test.
- The free tier carries no SLA or priority support — even for an internal office tool, a real production incident has nowhere to escalate beyond community channels.

## Operational Story

- **Preview deploys**: Wrangler supports versioned/gradual deployments (`wrangler versions deploy <version-id>@<pct>`); there is no automatic per-PR preview URL system built into this repo yet — CI currently only runs lint + build, not deploy. A preview workflow would need to be added (out of scope for this research; see `/10x-implement`).
- **Secrets**: Production secrets are set via `wrangler secret put <KEY>` (visible only as encrypted bindings, not readable back out); local dev secrets live in `.dev.vars` (gitignored). Non-secret vars go in `wrangler.jsonc` and are read via `astro:env/server`.
- **Rollback**: `wrangler rollback` reverts to the previously deployed Worker version in one command (or via Dashboard → Deployments → Rollback). This does **not** revert any Supabase database migration shipped in the same release — a schema change requires a coordinated manual rollback of both code and data.
- **Approval**: Running `wrangler deploy` to production and any `wrangler secret put` should require a human in the loop. Read-only operations — `wrangler tail` (log tailing), `wrangler deployments list`, local `astro build`/`astro check` — can run unattended by an agent.
- **Logs**: `wrangler tail` streams live JSON or pretty-printed logs, filterable by `--status`, `--header`, `--method`. Cloudflare's official MCP servers (`observability.mcp.cloudflare.com`, `docs.mcp.cloudflare.com`) expose the same data as structured tool calls for agent use instead of parsing CLI output.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Free-tier 10ms CPU cap causes intermittent 500s on auth/SSR routes | Devil's advocate / Pre-mortem | M | H | Move to Paid plan ($5/mo) before real usage begins; the cost is trivial relative to the risk. |
| Adapter (`@astrojs/cloudflare@13.5.0`) is one generation behind Astro 7-compatible 14.x | Devil's advocate | M | M | Track the adapter's changelog; budget a coordinated Astro + adapter + wrangler upgrade as a discrete task rather than an incidental side effect of an unrelated change. |
| Unverified `@supabase/ssr` behavior on `workerd` at the exact pinned versions | Devil's advocate / Research finding | L | H | Run a manual smoke test of the full sign-in/sign-up flow against a deployed (not just local) Worker before considering auth "done"; watch for cookie/session edge cases specific to `workerd`. |
| `wrangler rollback` reverts code but not Supabase schema changes | Unknown unknowns | L | H | Keep database migrations backward-compatible for at least one release, or document a manual data-rollback step alongside any migration-bearing deploy. |
| Dashboard "Auto Minify" setting silently breaks React hydration | Devil's advocate / Research finding | L | M | Explicitly disable Auto Minify in the Cloudflare dashboard as a one-time setup step; note it in deployment documentation so it isn't re-enabled by accident. |
| `nodejs_compat` behavior shifts based on `compatibility_date` in `wrangler.jsonc` | Unknown unknowns | L | M | Pin and periodically review `compatibility_date`; re-test after any bump. |
| No SLA/priority support on the free tier during a real incident | Unknown unknowns | L | L | Accept for an internal, non-critical office tool; revisit only if the tool becomes business-critical. |

## Getting Started

1. Confirm the existing adapter is current: `npm ls @astrojs/cloudflare wrangler astro` (expect `@astrojs/cloudflare@^13.5.x`, `wrangler@^4.90.x`, `astro@^6.3.x` — already satisfied in this repo).
2. Authenticate Wrangler once: `npx wrangler login`.
3. Set production secrets before the first real deploy: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`.
4. Build and deploy: `npm run build` then `npx wrangler deploy`.
5. Verify logs and rollback paths work before relying on them: `npx wrangler tail` (confirm live logs stream) and note the current deployment ID so `npx wrangler rollback` has a known-good target.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (adding an automated deploy step to `.github/workflows/ci.yml`)
- Production-scale architecture (multi-region, HA, DR)
