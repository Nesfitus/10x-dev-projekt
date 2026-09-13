-- Allow Admin to close a tournament (FR-011): status active -> closed.
-- No RLS policy currently permits any UPDATE on public.tournaments at all.
-- Same pattern as admin_update_matches/admin_update_predictions (S-05):
-- plain is_admin() gate, no service-role needed.

create policy "admin_update_tournaments"
  on public.tournaments
  for update
  using (public.is_admin(auth.uid()));
