-- Impl-review fix (F1, live-tournament-ranking): tournament_ranking() exposed
-- every active User's full email to any authenticated caller. Per user
-- decision, mask everything from '@' onward — the local part still lets
-- Users recognize each other by name, while the actual email/company
-- domain is no longer exposed to non-admin callers.

create or replace function public.tournament_ranking(p_tournament_id uuid)
returns table (user_id uuid, email text, points integer)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id as user_id,
    regexp_replace(u.email, '@.*$', '@***') as email,
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
