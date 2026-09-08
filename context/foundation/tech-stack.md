---
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
---

## Why this stack

Typer Sportowy to solo-projekt na 3 tygodnie pracy poza godzinami, którego MVP wymaga logowania (email + hasło), ręcznego wprowadzania danych przez admina, automatycznego liczenia punktów i bieżącego rankingu — całość w jednej, spójnej aplikacji webowej. 10x Astro Starter (Astro + React + TypeScript + Supabase + Cloudflare) jest zweryfikowanym, rekomendowanym wyborem dla web-app w rodzinie JavaScript/TypeScript: dostarcza gotowe uwierzytelnianie i bazę danych (Supabase) oraz wdrożenie (Cloudflare Pages) od razu po starcie, co bezpośrednio skraca pracę nad FR-001/FR-002 i pozwala skupić się na logice punktacji i widokach turnieju. Rozważano też .NET/Blazor oraz Angular, ale żadna z tych opcji nie oferowała w tym rejestrze jednej, spójnej aplikacji full-stack w jednym języku z porównywalnym poziomem gotowego wsparcia (Blazor nie ma szablonu w rejestrze, Angular jest czysto frontendowy i wymagałby osobnego backendu).
