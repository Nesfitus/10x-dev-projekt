-- Create predictions table (FR-006): User can predict a match result up
-- until kickoff, editable (upsert) any number of times before then. This is
-- the first table written by a plain User (not just Admin), so unlike
-- S-02/S-03 (where RLS was just an is_admin() gate and business rules lived
-- only in application code), the "active tournament only" / "not started
-- yet" rules must ALSO live in RLS WITH CHECK — otherwise a User could
-- bypass the API endpoint and write directly against the Supabase REST API
-- with their own session token.

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  predicted_home_score integer not null check (predicted_home_score >= 0),
  predicted_away_score integer not null check (predicted_away_score >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, match_id)
);

alter table public.predictions enable row level security;

create policy "admin_select_predictions"
  on public.predictions
  for select
  using (public.is_admin(auth.uid()));

-- NFR: a prediction stays hidden from other users until the match starts,
-- then becomes visible to everyone (forward-looking policy — no page in
-- this slice renders other users' predictions yet, see plan.md S-04).
create policy "user_select_own_or_started_predictions"
  on public.predictions
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.matches m
      where m.id = predictions.match_id
        and m.scheduled_at <= now()
    )
  );

create policy "user_insert_own_prediction"
  on public.predictions
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      join public.tournaments t on t.id = m.tournament_id
      where m.id = predictions.match_id
        and t.status = 'active'
        and m.scheduled_at > now()
    )
  );

create policy "user_update_own_prediction"
  on public.predictions
  for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      join public.tournaments t on t.id = m.tournament_id
      where m.id = predictions.match_id
        and t.status = 'active'
        and m.scheduled_at > now()
    )
  );

-- Widen tournaments/matches SELECT to any authenticated user (previously
-- Admin-only) — a User needs to see what's available to predict on.
-- Permissive policies sum with the existing admin_select_* ones, they don't
-- replace them.
create policy "user_select_tournaments"
  on public.tournaments
  for select
  using (auth.uid() is not null);

create policy "user_select_matches"
  on public.matches
  for select
  using (auth.uid() is not null);
