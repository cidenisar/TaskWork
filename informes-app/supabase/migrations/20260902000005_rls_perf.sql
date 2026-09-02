-- ============================================================================
-- Ajustes de performance detectados por el Supabase advisor tras aplicar el
-- schema inicial (get_advisors type=performance):
--   1) auth_rls_initplan: envolver auth.uid() en `(select auth.uid())` en las
--      policies que lo llaman directamente, para que el planner lo evalúe
--      una sola vez por query en vez de una vez por fila.
--      (Las policies que solo llaman a public.is_admin()/is_admin_or_supervisor()
--      no estaban flageadas — el auth.uid() interno de esas funciones STABLE
--      ya se cachea bien — así que no hace falta tocarlas.)
--   2) unindexed_foreign_keys: agregar índices a FKs sin cobertura.
-- No cambia ningún comportamiento, solo cómo se evalúa.
-- ============================================================================

-- ---- profiles ----
drop policy "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = (select auth.uid()) or public.is_admin());

-- ---- catálogos compartidos ----
drop policy "catalogo_tecnicos_select" on public.catalogo_tecnicos;
create policy "catalogo_tecnicos_select" on public.catalogo_tecnicos for select using ((select auth.uid()) is not null);
drop policy "catalogo_tecnicos_insert" on public.catalogo_tecnicos;
create policy "catalogo_tecnicos_insert" on public.catalogo_tecnicos for insert with check ((select auth.uid()) is not null);

drop policy "catalogo_torres_select" on public.catalogo_torres;
create policy "catalogo_torres_select" on public.catalogo_torres for select using ((select auth.uid()) is not null);
drop policy "catalogo_torres_insert" on public.catalogo_torres;
create policy "catalogo_torres_insert" on public.catalogo_torres for insert with check ((select auth.uid()) is not null);

drop policy "catalogo_provincias_select" on public.catalogo_provincias;
create policy "catalogo_provincias_select" on public.catalogo_provincias for select using ((select auth.uid()) is not null);
drop policy "catalogo_provincias_insert" on public.catalogo_provincias;
create policy "catalogo_provincias_insert" on public.catalogo_provincias for insert with check ((select auth.uid()) is not null);

drop policy "catalogo_tipos_informe_select" on public.catalogo_tipos_informe;
create policy "catalogo_tipos_informe_select" on public.catalogo_tipos_informe for select using ((select auth.uid()) is not null);
drop policy "catalogo_tipos_informe_insert" on public.catalogo_tipos_informe;
create policy "catalogo_tipos_informe_insert" on public.catalogo_tipos_informe for insert with check ((select auth.uid()) is not null);

drop policy "catalogo_categorias_gasto_select" on public.catalogo_categorias_gasto;
create policy "catalogo_categorias_gasto_select" on public.catalogo_categorias_gasto for select using ((select auth.uid()) is not null);
drop policy "catalogo_categorias_gasto_insert" on public.catalogo_categorias_gasto;
create policy "catalogo_categorias_gasto_insert" on public.catalogo_categorias_gasto for insert with check ((select auth.uid()) is not null);

drop policy "catalogo_vehiculos_select" on public.catalogo_vehiculos;
create policy "catalogo_vehiculos_select" on public.catalogo_vehiculos for select using ((select auth.uid()) is not null);

-- ---- Informes Técnicos ----
drop policy "informes_tecnicos_select_own" on public.informes_tecnicos;
create policy "informes_tecnicos_select_own" on public.informes_tecnicos
  for select using (created_by = (select auth.uid()));
drop policy "informes_tecnicos_insert_own" on public.informes_tecnicos;
create policy "informes_tecnicos_insert_own" on public.informes_tecnicos
  for insert with check (created_by = (select auth.uid()));
drop policy "informes_tecnicos_update_own" on public.informes_tecnicos;
create policy "informes_tecnicos_update_own" on public.informes_tecnicos
  for update using (created_by = (select auth.uid()));

drop policy "informe_tecnicos_asignados_own" on public.informe_tecnicos_asignados;
create policy "informe_tecnicos_asignados_own" on public.informe_tecnicos_asignados
  for all using (
    exists (select 1 from public.informes_tecnicos i where i.id = informe_id and i.created_by = (select auth.uid()))
  ) with check (
    exists (select 1 from public.informes_tecnicos i where i.id = informe_id and i.created_by = (select auth.uid()))
  );

drop policy "informe_vehiculos_own" on public.informe_vehiculos;
create policy "informe_vehiculos_own" on public.informe_vehiculos
  for all using (
    exists (select 1 from public.informes_tecnicos i where i.id = informe_id and i.created_by = (select auth.uid()))
  ) with check (
    exists (select 1 from public.informes_tecnicos i where i.id = informe_id and i.created_by = (select auth.uid()))
  );

drop policy "informe_imagenes_own" on public.informe_imagenes;
create policy "informe_imagenes_own" on public.informe_imagenes
  for all using (
    exists (select 1 from public.informes_tecnicos i where i.id = informe_id and i.created_by = (select auth.uid()))
  ) with check (
    exists (select 1 from public.informes_tecnicos i where i.id = informe_id and i.created_by = (select auth.uid()))
  );

-- ---- Rendición de Gastos ----
drop policy "rendiciones_gastos_select_own" on public.rendiciones_gastos;
create policy "rendiciones_gastos_select_own" on public.rendiciones_gastos
  for select using (created_by = (select auth.uid()));
drop policy "rendiciones_gastos_insert_own" on public.rendiciones_gastos;
create policy "rendiciones_gastos_insert_own" on public.rendiciones_gastos
  for insert with check (created_by = (select auth.uid()));
drop policy "rendiciones_gastos_update_own" on public.rendiciones_gastos;
create policy "rendiciones_gastos_update_own" on public.rendiciones_gastos
  for update using (created_by = (select auth.uid()));

drop policy "gastos_own" on public.gastos;
create policy "gastos_own" on public.gastos
  for all using (
    exists (select 1 from public.rendiciones_gastos r where r.id = rendicion_id and r.created_by = (select auth.uid()))
  ) with check (
    exists (select 1 from public.rendiciones_gastos r where r.id = rendicion_id and r.created_by = (select auth.uid()))
  );

drop policy "gasto_tecnicos_own" on public.gasto_tecnicos;
create policy "gasto_tecnicos_own" on public.gasto_tecnicos
  for all using (
    exists (
      select 1 from public.gastos g
      join public.rendiciones_gastos r on r.id = g.rendicion_id
      where g.id = gasto_id and r.created_by = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from public.gastos g
      join public.rendiciones_gastos r on r.id = g.rendicion_id
      where g.id = gasto_id and r.created_by = (select auth.uid())
    )
  );

-- ---- Configuración ----
drop policy "config_emails_envio_select" on public.config_emails_envio;
create policy "config_emails_envio_select" on public.config_emails_envio for select using ((select auth.uid()) is not null);

drop policy "config_general_select" on public.config_general;
create policy "config_general_select" on public.config_general for select using ((select auth.uid()) is not null);

-- ---- audit_log ----
drop policy "audit_log_insert_admin" on public.audit_log;
create policy "audit_log_insert_admin" on public.audit_log
  for insert
  with check (public.is_admin() and actor_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Índices para FKs sin cobertura
-- ---------------------------------------------------------------------------
create index audit_log_actor_id_idx on public.audit_log (actor_id);
create index catalogo_tecnicos_created_by_idx on public.catalogo_tecnicos (created_by);
create index catalogo_tecnicos_torre_idx on public.catalogo_tecnicos (torre);
create index gasto_tecnicos_gasto_id_idx on public.gasto_tecnicos (gasto_id);
create index informe_tecnicos_asignados_informe_id_idx on public.informe_tecnicos_asignados (informe_id);
create index informe_vehiculos_informe_id_idx on public.informe_vehiculos (informe_id);
create index vehiculo_services_created_by_idx on public.vehiculo_services (created_by);
create index vehiculo_services_vehiculo_id_idx on public.vehiculo_services (vehiculo_id);
