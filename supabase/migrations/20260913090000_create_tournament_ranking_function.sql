-- Create tournament_ranking(): full tournament ranking (FR-010) for any
-- authenticated User or Admin. Unlike is_admin() (which only checks the
-- caller's own role), this function deliberately returns data about OTHER
-- users (email, points) to a caller who has no RLS access to it otherwise.
-- That is intentional and the only place in this database that happens —
-- acceptable because: (a) the function takes a single tournament_id
-- parameter and does not let the caller construct an arbitrary query,
-- (b) it returns exactly three fields, nothing more, (c) EXECUTE is
-- granted only to the authenticated role, (d) `set search_path` guards
-- against schema-hijacking, same pattern as handle_new_user().
--
-- No existing RLS policy on profiles/predictions is touched: profiles
-- still only exposes each User's own row, and predictions still only
-- exposes rows per its existing policies. All new exposure is scoped to
-- this one function's three output columns.

create or replace function public.tournament_ranking(p_tournament_id uuid)
returns table (user_id uuid, email text, points integer)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id as user_id,
    u.email::text as email,
    coalesce(sum(pr.points), 0)::integer as points
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.predictions pr
    on pr.user_id = p.id
    and pr.match_id in (
      select m.id from public.matches m where m.tournament_id = p_tournament_id
    )
  where p.role = 'user' and p.disabled = false
  group by p.id, u.email
  order by points desc, u.email asc;
$$;

grant execute on function public.tournament_ranking(uuid) to authenticated;
