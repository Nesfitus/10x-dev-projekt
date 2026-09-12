-- Add actual match result + prediction points (FR-007/FR-008): Admin can
-- record a match's real score, and the system immediately scores every
-- existing prediction for that match (3 exact / 1 correct direction /
-- 0 otherwise). Both columns are nullable: NULL means "not yet entered" /
-- "not yet scored".
--
-- Unlike S-02 (which needed createAdminClient()/service-role because
-- profiles.disabled had no UPDATE policy at all and auth.admin.* was
-- required), Admin writes here go through plain RLS: is_admin(auth.uid())
-- is a sufficient, simpler gate — no service-role client needed for this
-- change.

alter table public.matches
  add column actual_home_score integer check (actual_home_score >= 0),
  add column actual_away_score integer check (actual_away_score >= 0);

alter table public.predictions
  add column points integer check (points in (0, 1, 3));

create policy "admin_update_matches"
  on public.matches
  for update
  using (public.is_admin(auth.uid()));

create policy "admin_update_predictions"
  on public.predictions
  for update
  using (public.is_admin(auth.uid()));
