-- Arregla "infinite recursion detected in policy for relation
-- guardia_participacion" (42P17): las policies de guardia_participacion
-- comprobaban "¿soy la guardia general de este evento?" con una subquery
-- sobre la MISMA tabla — Postgres no puede resolverlo (para evaluar esa
-- subquery necesita re-evaluar la misma policy, que vuelve a disparar la
-- subquery, sin fin). Nunca se detectó porque los tests existentes son
-- lógica pura en JS y nunca pegan contra RLS real — recién apareció al
-- probar el circuito de punta a punta por primera vez, y rompía TODO lo
-- que lee guardia_participacion, incluido en cascada guardia_evento y
-- guardia_novedad (sus policies también hacen exists(...) contra
-- guardia_participacion).
--
-- Arreglo estándar de Postgres para esto: mover el chequeo
-- autorreferenciado a una función security definer que bypasea RLS al
-- consultar — mismo patrón que is_admin_or_supervisor() (20261106000001).
create or replace function public.guardia_es_general_del_evento(p_evento_id uuid, p_usuario_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.guardia_participacion gg
    where gg.evento_id = p_evento_id and gg.usuario_id = p_usuario_id and gg.rol = 'GUARDIA_GENERAL'
  );
$$;

drop policy "guardia_participacion_select" on public.guardia_participacion;
create policy "guardia_participacion_select" on public.guardia_participacion
  for select using (
    usuario_id = (select auth.uid())
    or public.guardia_es_general_del_evento(evento_id, (select auth.uid()))
    or public.is_admin_or_supervisor()
  );

drop policy "guardia_participacion_insert" on public.guardia_participacion;
create policy "guardia_participacion_insert" on public.guardia_participacion
  for insert with check (
    public.is_admin_or_supervisor()
    or public.guardia_es_general_del_evento(evento_id, (select auth.uid()))
  );

drop policy "guardia_participacion_update" on public.guardia_participacion;
create policy "guardia_participacion_update" on public.guardia_participacion
  for update using (
    usuario_id = (select auth.uid())
    or public.guardia_es_general_del_evento(evento_id, (select auth.uid()))
    or public.is_admin_or_supervisor()
  );
