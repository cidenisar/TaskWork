-- ============================================================================
-- Lectura agregada para Estadísticas (spec sección 8, solo Supervisor/Admin).
-- Son policies de SELECT adicionales (permissive: se suman con OR a las que
-- ya existen) — un Técnico sigue viendo únicamente sus propios informes y
-- rendiciones vía las policies "_select_own" de 20260902000000_init.sql.
-- Así el módulo de Estadísticas puede leer con la sesión normal del usuario,
-- sin necesitar la service role key.
-- ============================================================================

create policy "informes_tecnicos_select_stats" on public.informes_tecnicos
  for select using (public.is_admin_or_supervisor());

create policy "informe_tecnicos_asignados_select_stats" on public.informe_tecnicos_asignados
  for select using (public.is_admin_or_supervisor());

create policy "informe_imagenes_select_stats" on public.informe_imagenes
  for select using (public.is_admin_or_supervisor());

create policy "rendiciones_gastos_select_stats" on public.rendiciones_gastos
  for select using (public.is_admin_or_supervisor());

create policy "gastos_select_stats" on public.gastos
  for select using (public.is_admin_or_supervisor());

create policy "gasto_tecnicos_select_stats" on public.gasto_tecnicos
  for select using (public.is_admin_or_supervisor());
