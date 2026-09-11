-- ============================================================================
-- Catálogo de Clientes — mismo patrón que catalogo_torres / catalogo_provincias:
-- cualquier usuario autenticado puede leer y agregar "al vuelo" (se usa como
-- sugerencia en el campo Cliente del Informe Técnico), solo un Administrador
-- lo edita/borra desde Configuración → Catálogos.
-- ============================================================================

create table public.catalogo_clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

alter table public.catalogo_clientes enable row level security;

create policy "catalogo_clientes_select" on public.catalogo_clientes for select using (auth.uid() is not null);
create policy "catalogo_clientes_insert" on public.catalogo_clientes for insert with check (auth.uid() is not null);
create policy "catalogo_clientes_admin_delete" on public.catalogo_clientes for delete using (public.is_admin());
