-- Bug real preexistente (desde la migración original de Guardia General,
-- nunca detectado hasta probar el circuito de punta a punta): varias
-- policies comparaban una columna con un nombre ambiguo que Postgres
-- resolvía contra la tabla EQUIVOCADA (shadowing) en vez de contra el
-- evento de afuera —
--
--   guardia_evento_select / guardia_evento_update:
--     "... where p.evento_id = id ..." — adentro de la subquery sobre
--     guardia_participacion (que TAMBIÉN tiene una columna `id`), el `id`
--     suelto se resolvía como `p.id` (la propia fila de participación),
--     no como `guardia_evento.id` (el evento de afuera). Como
--     `p.evento_id = p.id` prácticamente nunca es cierto, la policy de
--     UPDATE quedaba SIEMPRE falsa para cualquiera que no fuera
--     admin/supervisor — por eso "Cerrar evento" nunca afectaba ninguna
--     fila (sin error, cero filas).
--
--   guardia_novedad_select / guardia_novedad_insert:
--     "... where p.evento_id = evento_id ..." — acá el bug es al revés:
--     `evento_id` suelto se resolvía como `p.evento_id` (la misma
--     columna de la subquery), volviendo la comparación una tautología
--     (`p.evento_id = p.evento_id`, siempre cierta) — la policy quedaba
--     MÁS permisiva de lo debido (cualquier participante de CUALQUIER
--     evento podía, por policy, leer/insertar novedades de cualquier
--     otro evento; la app igual filtraba por evento_id en cada consulta,
--     así que no se vio en pantalla, pero la policy en sí no protegía
--     nada).
--
-- Arreglo: el mismo patrón que ya se usó para el bug de recursión de
-- guardia_participacion — mover el chequeo a funciones security definer
-- con parámetros de nombre distinto a las columnas, así no hay forma de
-- que Postgres los confunda.
create or replace function public.guardia_participo_en(p_evento_id uuid, p_usuario_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.guardia_participacion p
    where p.evento_id = p_evento_id and p.usuario_id = p_usuario_id
  );
$$;

drop policy "guardia_evento_select" on public.guardia_evento;
create policy "guardia_evento_select" on public.guardia_evento
  for select using (
    creado_por = (select auth.uid())
    or public.guardia_participo_en(id, (select auth.uid()))
    or public.is_admin_or_supervisor()
  );

drop policy "guardia_evento_update" on public.guardia_evento;
create policy "guardia_evento_update" on public.guardia_evento
  for update using (
    public.is_admin_or_supervisor()
    or public.guardia_es_general_del_evento(id, (select auth.uid()))
  );

drop policy "guardia_novedad_select" on public.guardia_novedad;
create policy "guardia_novedad_select" on public.guardia_novedad
  for select using (
    public.guardia_participo_en(evento_id, (select auth.uid()))
    or public.is_admin_or_supervisor()
  );

drop policy "guardia_novedad_insert" on public.guardia_novedad;
create policy "guardia_novedad_insert" on public.guardia_novedad
  for insert with check (
    public.guardia_participo_en(evento_id, (select auth.uid()))
    or public.is_admin_or_supervisor()
  );
