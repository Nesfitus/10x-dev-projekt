-- Create profiles table with role-based access control (Admin/User).
-- Every new auth.users row automatically gets a corresponding profiles row
-- via trigger, defaulting to role 'user'. Role promotion to 'admin' is a
-- manual, out-of-band operation (see plan.md Phase 2) — never exposed
-- through the API.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- SECURITY DEFINER is required here: a policy that queries `profiles`
-- directly from within a `profiles` policy causes infinite recursion.
-- Wrapping the role check in a SECURITY DEFINER function breaks that cycle.
create function public.is_admin(uid uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles where id = uid and role = 'admin'
  );
$$;

create policy "select_own_profile"
  on public.profiles
  for select
  using (auth.uid() = id);

create policy "admin_select_all_profiles"
  on public.profiles
  for select
  using (public.is_admin(auth.uid()));

-- No insert/update/delete policies for anon/authenticated roles: the only
-- write path is this trigger (runs as SECURITY DEFINER, bypassing RLS) or
-- direct service_role / Supabase Studio access.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
