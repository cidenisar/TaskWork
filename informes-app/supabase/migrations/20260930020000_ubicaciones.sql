-- ============================================================================
-- Ubicaciones — catálogo compartido de sitios físicos (Provincia → Sector/
-- Oficina → Sala), usado por Tableros y Racks en vez de que cada uno tenga
-- su propio campo de texto libre "sitio" (que se fragmentaba: "Sala RTIC",
-- "sala rtic", "RTIC" podían terminar siendo 3 registros distintos del
-- mismo lugar físico, sin forma de agruparlos).
--
-- Con una Ubicación compartida, un tablero y un rack que están en la misma
-- sala (ej. "Luján 1") apuntan al mismo ubicacion_id, y se puede armar un
-- resumen agregado (Ubicaciones → Resumen por Sala) de todo el equipamiento
-- relevado ahí, sin importar de qué módulo vino.
--
-- Alta al vuelo, mismo criterio que catalogo_clientes/catalogo_torres —
-- cualquier usuario autenticado puede crear una Ubicación nueva; solo un
-- Admin la edita/borra.
-- ============================================================================

create table public.ubicaciones (
  id uuid primary key default gen_random_uuid(),
  provincia text not null,
  sector_oficina text,
  sala text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (provincia, sector_oficina, sala)
);

alter table public.ubicaciones enable row level security;
create policy "ubicaciones_select" on public.ubicaciones for select using ((select auth.uid()) is not null);
create policy "ubicaciones_insert" on public.ubicaciones for insert with check ((select auth.uid()) is not null);
create policy "ubicaciones_admin_update" on public.ubicaciones for update using (public.is_admin());
create policy "ubicaciones_admin_delete" on public.ubicaciones for delete using (public.is_admin());

-- Tableros: reemplaza "sitio" (texto libre) por una referencia a Ubicaciones.
-- Backfill de los tableros de prueba ya cargados: una Ubicación nueva por
-- cada "sitio" distinto que tuvieran, con provincia "Sin especificar" (el
-- Admin la puede corregir desde el propio tablero más adelante si hace falta).
alter table public.tableros add column ubicacion_id uuid references public.ubicaciones (id);

insert into public.ubicaciones (provincia, sala, created_by)
select distinct 'Sin especificar', t.sitio, t.created_by
from public.tableros t
where t.sitio is not null;

update public.tableros t
set ubicacion_id = u.id
from public.ubicaciones u
where u.provincia = 'Sin especificar' and u.sector_oficina is null and u.sala = t.sitio;

alter table public.tableros alter column ubicacion_id set not null;
alter table public.tableros drop column sitio;
create index tableros_ubicacion_id_idx on public.tableros (ubicacion_id);

-- Racks: mismo cambio. No hay racks cargados todavía, así que no hace falta backfill.
alter table public.racks add column ubicacion_id uuid not null references public.ubicaciones (id);
alter table public.racks drop column sitio;
create index racks_ubicacion_id_idx on public.racks (ubicacion_id);
