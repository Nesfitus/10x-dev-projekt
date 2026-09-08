# Repository Guidelines

Astro 6 SSR app (React 19 islands, Tailwind 4, Supabase auth, shadcn/ui) deployed to Cloudflare Workers via Wrangler.

## Hard Rules

- API routes must export `const prerender = false` — the app is fully SSR (`output: "server"`), not static.
- Use Astro components for static content/layout; reach for React only when interactivity is needed.
- Use `cn()` from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged Tailwind classes; never concatenate class strings manually.
- New Supabase tables need a migration in `supabase/migrations/` named `YYYYMMDDHHmmss_short_description.sql`, with RLS enabled and granular per-operation, per-role policies.
- React components use no Next.js directives (no `"use client"`); extract hooks to `src/components/hooks/`.
- API route handlers export uppercase `GET`/`POST` and validate input with zod.

## Project Structure

- `src/pages/` — Astro pages; `src/pages/api/` — API endpoints, incl. auth at `src/pages/api/auth/{signin,signup,signout}.ts`.
- `src/pages/auth/{signin,signup,confirm-email}.astro` — auth pages; `src/pages/dashboard.astro` — protected page example (redirects to `/auth/signin` if unauthenticated).
- `src/components/` — Astro & React components; shadcn/ui primitives in `src/components/ui/` ("new-york" variant); add new ones with `npx shadcn@latest add [name]`.
- `src/lib/` — services/helpers (`src/lib/services/` for extracted logic); `src/lib/supabase.ts` builds the cookie-based SSR auth client.
- `src/middleware.ts` — resolves `context.locals.user` per request; redirects unauthenticated users away from `PROTECTED_ROUTES`.
- `src/types.ts` — shared entities/DTOs. `supabase/migrations/` — SQL migrations (none yet; auth-only via Supabase's built-in `auth.users`).

## Build, Test, and Dev Commands

- `npm run dev` — dev server (Cloudflare workerd runtime).
- `npm run build` — production build (`@astrojs/cloudflare`); CI runs `npx astro sync` first.
- `npm run lint` / `npm run lint:fix` — ESLint, type-checked rules (@eslint.config.js).
- `npm run format` — Prettier (astro + tailwind plugins).
- No automated test suite yet; validate with `npm run lint` and `npm run build`.

## Coding Style & Naming

- Path alias `@/*` → `./src/*` (@tsconfig.json); TypeScript strict mode, ESLint enforced (@eslint.config.js).
- Pre-commit (husky + lint-staged): `eslint --fix` on `*.{ts,tsx,astro}`, `prettier --write` on `*.{json,css,md}`.

## CI & Configuration

- `.github/workflows/ci.yml` runs `lint` then `build` on push/PR to `master`; build needs `SUPABASE_URL`/`SUPABASE_KEY` as repo secrets.
- Local secrets: `.env` (Node) or `.dev.vars` (Cloudflare, gitignored) — copy from `.env.example`.
- Node v22.14.0 (@.nvmrc). Local Supabase via `npx supabase start` (Docker required).
- Deploy: `npx wrangler deploy` (requires Cloudflare account + `wrangler` auth); secrets go via `npx wrangler secret put` or the Cloudflare dashboard.
- Commit/PR conventions not yet established — the CI gate (lint + build) is the baseline requirement.
