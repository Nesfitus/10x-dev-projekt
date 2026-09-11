-- Add soft-disable flag to profiles (S-02: admin-manages-users).
-- Admin can deactivate a User account (never an Admin account) without
-- physically deleting it. Enforcement of this flag happens in
-- src/middleware.ts, not via RLS (no UPDATE policy exists on profiles —
-- writes to this column go through the service_role client only).

alter table public.profiles
  add column disabled boolean not null default false;
