-- ============================================================================
-- Catálogo de instrucciones configurables para la lectura de tickets/
-- comprobantes con IA en Rendición de Gastos (Configuración → Catálogos).
-- Mismo mecanismo visual que catalogo_inspeccion_ia (lista de texto libre
-- que un Admin agrega/quita), pero con otro propósito: acá no es un
-- checklist de bien/mal, son instrucciones que se le suman al prompt de
-- lectura (ej. "si dice peaje o AUSA, categoría = Peajes") — por eso es una
-- tabla propia y no una reutilización de catalogo_inspeccion_ia.
-- ============================================================================

create table public.catalogo_lectura_gastos_ia (
  id uuid primary key default gen_random_uuid(),
  orden integer not null default 0,
  texto text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.catalogo_lectura_gastos_ia enable row level security;

-- Igual criterio que catalogo_inspeccion_ia: catálogo de configuración,
-- lectura abierta a cualquier usuario autenticado, solo Admin (o
-- Superusuario, ya incluido en is_admin()) lo edita.
create policy "catalogo_lectura_gastos_ia_select" on public.catalogo_lectura_gastos_ia
  for select using ((select auth.uid()) is not null);
create policy "catalogo_lectura_gastos_ia_admin_insert" on public.catalogo_lectura_gastos_ia
  for insert with check (public.is_admin());
create policy "catalogo_lectura_gastos_ia_admin_delete" on public.catalogo_lectura_gastos_ia
  for delete using (public.is_admin());
