-- ============================================================================
-- Inspección IA — generaliza "Hallazgos de Seguridad de Tablero" (catálogo +
-- tabla de resultados) a CUALQUIER relevamiento que use identificación por
-- IA (Tableros, Racks, Equipos Individuales, Torres de Comunicación). Antes
-- cada módulo iba a necesitar su propio catálogo + tabla + código repetido
-- para sumar esto; ahora es un solo par de tablas con un campo `modulo`
-- (texto libre, igual criterio que mantenimiento_checklist_items.categoria:
-- no hay un enum Postgres único que sirva para relevamientos de tipos tan
-- distintos). Un Admin agrega/edita qué buscar por módulo desde
-- Configuración → Catálogos sin tocar código ni re-desplegar nada.
--
-- La lectura con IA de cada módulo (/api/<modulo>/leer-foto) evalúa los
-- ítems del módulo correspondiente contra las mismas fotos que ya usa para
-- identificar circuitos/equipamiento — el técnico siempre revisa/corrige
-- antes de guardar, la IA nunca escribe directo a la base. Mismos 3 valores
-- de estado que el checklist de mantenimiento (ok/no_ok/no_aplica).
-- ============================================================================

create table public.catalogo_inspeccion_ia (
  id uuid primary key default gen_random_uuid(),
  modulo text not null,
  orden integer not null default 0,
  texto text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index catalogo_inspeccion_ia_modulo_idx on public.catalogo_inspeccion_ia (modulo);

-- `registro_id` apunta a la fila del relevamiento/medición que generó el
-- resultado (tablero_mediciones, rack_relevamientos, equipo_relevamientos o
-- torre_comunicacion_relevamientos según `modulo`) — no hay una sola tabla
-- para referenciar con foreign key, así que la integridad la resuelve el
-- código (siempre inserta junto con el registro padre) y el RLS de abajo.
create table public.inspeccion_ia_hallazgos (
  id uuid primary key default gen_random_uuid(),
  modulo text not null,
  registro_id uuid not null,
  item_id uuid not null references public.catalogo_inspeccion_ia (id),
  estado text not null check (estado in ('ok', 'no_ok', 'no_aplica')),
  comentario text,
  unique (modulo, registro_id, item_id)
);
create index inspeccion_ia_hallazgos_registro_idx on public.inspeccion_ia_hallazgos (modulo, registro_id);

alter table public.catalogo_inspeccion_ia enable row level security;
alter table public.inspeccion_ia_hallazgos enable row level security;

-- Igual criterio que mantenimiento_checklist_items: catálogo de
-- configuración, lectura abierta, solo Admin lo edita.
create policy "catalogo_inspeccion_ia_select" on public.catalogo_inspeccion_ia
  for select using ((select auth.uid()) is not null);
create policy "catalogo_inspeccion_ia_admin_insert" on public.catalogo_inspeccion_ia
  for insert with check (public.is_admin());
create policy "catalogo_inspeccion_ia_admin_delete" on public.catalogo_inspeccion_ia
  for delete using (public.is_admin());

-- Solo se puede insertar un resultado si el registro padre (según `modulo`)
-- existe y es del mismo creador — igual criterio que
-- tablero_medicion_hallazgos_insert, generalizado por módulo.
create policy "inspeccion_ia_hallazgos_select" on public.inspeccion_ia_hallazgos
  for select using ((select auth.uid()) is not null);
create policy "inspeccion_ia_hallazgos_insert" on public.inspeccion_ia_hallazgos
  for insert with check (
    case modulo
      when 'tableros' then exists (
        select 1 from public.tablero_mediciones m where m.id = registro_id and m.created_by = (select auth.uid())
      )
      when 'racks' then exists (
        select 1 from public.rack_relevamientos m where m.id = registro_id and m.created_by = (select auth.uid())
      )
      when 'equipos' then exists (
        select 1 from public.equipo_relevamientos m where m.id = registro_id and m.created_by = (select auth.uid())
      )
      when 'torres' then exists (
        select 1 from public.torre_comunicacion_relevamientos m where m.id = registro_id and m.created_by = (select auth.uid())
      )
      else false
    end
  );

-- Migra el catálogo y los resultados ya cargados de Hallazgos de Seguridad
-- de Tablero (modulo='tableros') — se conserva todo lo configurado y
-- relevado hasta ahora, nada se pierde en la generalización.
insert into public.catalogo_inspeccion_ia (id, modulo, orden, texto, created_by, created_at)
select id, 'tableros', orden, texto, created_by, created_at
from public.catalogo_hallazgos_seguridad_tablero;

insert into public.inspeccion_ia_hallazgos (id, modulo, registro_id, item_id, estado, comentario)
select id, 'tableros', medicion_id, item_id, estado, comentario
from public.tablero_medicion_hallazgos;

drop table public.tablero_medicion_hallazgos;
drop table public.catalogo_hallazgos_seguridad_tablero;
