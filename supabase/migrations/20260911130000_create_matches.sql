-- Create matches table (FR-005): Admin can add matches (tournament fixtures)
-- with a scheduled date/time. Only Admin may select/insert/delete rows
-- (RLS); Users get no access until a future slice (S-04) needs it. No
-- update policy — editing a match is out of scope (see plan.md).
--
-- Business rules ("only add to an active tournament", "block delete after
-- kickoff") are enforced in application code (see the API endpoints), not
-- here — both are triggered by a single, sequential Admin action with no
-- concurrency risk, unlike the "one active tournament" rule in S-01.

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  home_team text not null,
  away_team text not null,
  scheduled_at timestamptz not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.matches enable row level security;

create policy "admin_select_matches"
  on public.matches
  for select
  using (public.is_admin(auth.uid()));

create policy "admin_insert_matches"
  on public.matches
  for insert
  with check (public.is_admin(auth.uid()));

create policy "admin_delete_matches"
  on public.matches
  for delete
  using (public.is_admin(auth.uid()));
