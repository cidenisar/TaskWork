-- Permite que un Administrador escriba en audit_log desde una Server Action
-- con su propia sesión (sin necesitar la service role key). Las lecturas ya
-- estaban restringidas a Admin desde 20260902000000_init.sql.
create policy "audit_log_insert_admin" on public.audit_log
  for insert
  with check (public.is_admin() and actor_id = auth.uid());
