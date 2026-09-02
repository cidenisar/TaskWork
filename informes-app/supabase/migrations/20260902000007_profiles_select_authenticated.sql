-- ============================================================================
-- Con el catálogo de técnicos ahora armado a partir de profiles, cualquier
-- usuario logueado necesita poder leer nombre_completo/torre de sus
-- compañeros para el selector "Agregar Técnico" del wizard de Informe
-- Técnico / Rendición de Gastos (antes esto lo cubría catalogo_tecnicos_select,
-- que era igual de abierta: `auth.uid() is not null`). Esta policy es
-- adicional (permissive, se suma con OR) a profiles_select_own_or_admin —
-- no le saca nada a nadie, solo agrega lectura al resto de las filas.
-- ============================================================================

create policy "profiles_select_authenticated" on public.profiles
  for select using ((select auth.uid()) is not null);
