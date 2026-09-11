-- Create tournaments table (FR-004): Admin can create a new tournament.
-- Only Admin may insert/select rows (RLS); Users get no access until a
-- future slice (S-04/S-06) needs it. At most one tournament may be
-- 'active' at a time — enforced by a partial unique index, not application
-- code, so it holds even under concurrent inserts.

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.tournaments enable row level security;

create policy "admin_select_tournaments"
  on public.tournaments
  for select
  using (public.is_admin(auth.uid()));

create policy "admin_insert_tournaments"
  on public.tournaments
  for insert
  with check (public.is_admin(auth.uid()));

-- Partial unique index: all rows with status = 'active' share the same
-- indexed value, so uniqueness caps the count of such rows at one. This
-- enforces "one active tournament at a time" (FR-004) at the data layer.
create unique index tournaments_one_active_idx
  on public.tournaments (status)
  where status = 'active';
