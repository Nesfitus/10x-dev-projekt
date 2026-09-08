---
bootstrapped_at: 2026-09-07T15:26:58Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: typer-sportowy
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: typer-sportowy
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

### Why this stack

Typer Sportowy to solo-projekt na 3 tygodnie pracy poza godzinami, którego MVP wymaga logowania (email + hasło), ręcznego wprowadzania danych przez admina, automatycznego liczenia punktów i bieżącego rankingu — całość w jednej, spójnej aplikacji webowej. 10x Astro Starter (Astro + React + TypeScript + Supabase + Cloudflare) jest zweryfikowanym, rekomendowanym wyborem dla web-app w rodzinie JavaScript/TypeScript: dostarcza gotowe uwierzytelnianie i bazę danych (Supabase) oraz wdrożenie (Cloudflare Pages) od razu po starcie, co bezpośrednio skraca pracę nad FR-001/FR-002 i pozwala skupić się na logice punktacji i widokach turnieju. Rozważano też .NET/Blazor oraz Angular, ale żadna z tych opcji nie oferowała w tym rejestrze jednej, spójnej aplikacji full-stack w jednym języku z porównywalnym poziomem gotowego wsparcia (Blazor nie ma szablonu w rejestrze, Angular jest czysto frontendowy i wymagałby osobnego backendu).

## Pre-scaffold verification

| Signal             | Value                                          | Severity | Notes                                          |
| ------------------ | ----------------------------------------------- | -------- | ----------------------------------------------- |
| npm package        | not run                                         | n/a      | cmd_template starts with `git clone`; no npm CLI package to check |
| GitHub repo        | przeprogramowani/10x-astro-starter last pushed 2026-08-22T21:44:30Z | fresh    | from card.docs_url, 15 days before bootstrap    |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0 (first `npm install` attempt hit a transient network error, `ECONNRESET`; retried once and succeeded with exit code 0)
**Files moved**: 31515
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: absent in cwd — moved silently
**.github/ handling**: merged (cwd already had `.github/` with skills/prompts content; scaffold's `.github/workflows/ci.yml` had no path overlap and was copied in without conflict)
**.bootstrap-scaffold cleanup**: deleted (including cloned `.git/`, removed before move-up)

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 1 CRITICAL, 14 HIGH, 7 MODERATE, 3 LOW
**Direct vs transitive**: 0/1/2/0 direct of total 1/14/7/3 (CRITICAL/HIGH/MODERATE/LOW) — direct findings: `astro` (high), `@supabase/supabase-js` (moderate), `wrangler` (moderate)

#### CRITICAL findings

- **tar** (transitive) — range `<=7.5.20`. Multiple advisories bundled, most severe: "node-tar: Decompression/parse DoS via unlimited input" ([GHSA-23hp-3jrh-7fpw](https://github.com/advisories/GHSA-23hp-3jrh-7fpw)), severity critical. Fix available: yes (`npm audit fix`).

#### HIGH findings

- **astro** (direct, declared `^6.3.1`) — range `<=7.0.9`. Includes "Host header SSRF in prerendered error page fetch" ([GHSA-2pvr-wf23-7pc7](https://github.com/advisories/GHSA-2pvr-wf23-7pc7)) and "Reflected XSS via unescaped slot name" ([GHSA-8hv8-536x-4wqp](https://github.com/advisories/GHSA-8hv8-536x-4wqp)). Fix available: yes.
- **brace-expansion** (transitive) — range `<=1.1.17 || 3.0.0 - 5.0.8`.
- **browserslist** (transitive) — range `<=4.28.6`.
- **devalue** (transitive) — range `5.6.3 - 5.8.0`.
- **fast-uri** (transitive) — range `3.0.0 - 3.1.5`.
- **js-yaml** (transitive) — range `4.0.0 - 4.3.0`.
- **miniflare** (transitive) — range `<=0.0.0-fff677e35 || 3.20250204.0 - 5.20260801.0-alpha`.
- **nanoid** (transitive) — range `<=3.3.17`.
- **postcss** (transitive) — range `<=8.5.22`.
- **sharp** (transitive) — range `<0.35.0`.
- **svgo** (transitive) — range `4.0.0 - 4.0.1`.
- **undici** (transitive) — range `7.0.0 - 7.28.0`.
- **vite** (transitive) — range `7.0.0 - 7.3.3`.
- **ws** (transitive) — range `8.0.0 - 8.20.1`.

#### MODERATE findings

- **@astrojs/language-server** (transitive)
- **@cloudflare/vite-plugin** (transitive)
- **supabase** (direct, declared `@supabase/supabase-js ^2.99.1`)
- **volar-service-yaml** (transitive)
- **wrangler** (direct, declared `^4.90.0`)
- **yaml** (transitive)
- **yaml-language-server** (transitive)

#### LOW / INFO findings

- **@babel/core** (transitive)
- **esbuild** (transitive)
- **postcss-selector-parser** (transitive)

## Hints recorded but not acted on

| Hint                       | Value              |
| -------------------------- | ------------------ |
| bootstrapper_confidence    | first-class         |
| quality_override           | false               |
| path_taken                 | standard            |
| self_check_answers         | null                |
| team_size                  | solo                |
| deployment_target          | cloudflare-pages    |
| ci_provider                | github-actions      |
| ci_default_flow            | auto-deploy-on-merge|
| has_auth                   | true                |
| has_payments               | false               |
| has_realtime               | false               |
| has_ai                     | false               |
| has_background_jobs        | false               |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep (none were created this run).
- Address audit findings per your project's risk tolerance — run `npm audit fix` to resolve the fixable findings (including the CRITICAL `tar` finding and the direct `astro` HIGH finding), then re-run `npm audit` to confirm.
