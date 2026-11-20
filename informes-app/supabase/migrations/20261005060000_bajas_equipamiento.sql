-- ============================================================================
-- Bajas de equipamiento: un tablero/rack/equipo individual se puede romper,
-- quedar obsoleto o sobrar por una ampliación — hasta ahora no había forma
-- de sacarlo del equipamiento "activo" de un sitio ni de dejar un
-- comprobante para entregarlo a depósito.
--
-- `estado` en las 3 tablas de equipamiento (default 'activo', nunca se
-- borra una fila al dar de baja algo — mismo criterio que el resto de la
-- app: el registro queda para siempre, solo cambia su estado). Filtrar por
-- esto es responsabilidad de cada pantalla que ya lee estas tablas (ficha
-- de Sitio, selector de equipamiento existente al cargar un nuevo
-- relevamiento) — esta migración no mueve datos, solo agrega la columna.
--
-- `bajas_equipamiento` es un registro aparte, permanente, uno por cada baja
-- — con una "foto" de los datos del equipo al momento de la baja (igual
-- criterio que el resto de los módulos con PDF: el documento no depende de
-- que la fila original siga teniendo el mismo contenido después). Solo
-- Admin/Supervisor puede dar de baja (mismo gate que ya usa Estadísticas,
-- `is_admin_or_supervisor()`) — es una decisión operativa, no algo que
-- cualquier técnico resuelve solo.
-- ============================================================================

create type public.motivo_baja as enum ('rotura', 'ampliacion', 'obsolescencia', 'otro');
create type public.tipo_equipo_baja as enum ('tablero_circuito', 'rack_equipamiento', 'equipo_individual');

alter table public.tablero_circuitos
  add column estado text not null default 'activo' check (estado in ('activo', 'baja'));
alter table public.rack_equipamientos
  add column estado text not null default 'activo' check (estado in ('activo', 'baja'));
alter table public.equipos
  add column estado text not null default 'activo' check (estado in ('activo', 'baja'));

create table public.bajas_equipamiento (
  id uuid primary key default gen_random_uuid(),
  numero_generacion text not null unique,
  tipo_equipo public.tipo_equipo_baja not null,
  equipo_id uuid not null,
  -- "Foto" del equipo al momento de la baja, no un join en vivo.
  equipo_texto text not null,
  equipo_categoria text not null,
  equipo_marca_modelo text,
  equipo_numero_serie text,
  equipo_etiqueta_ypf text,
  ubicacion_id uuid not null references public.ubicaciones (id),
  motivo public.motivo_baja not null,
  comentario text,
  fecha date not null,
  created_by uuid not null references public.profiles (id),
  pdf_url text,
  pdf_generado_at timestamptz,
  created_at timestamptz not null default now()
);

create index bajas_equipamiento_ubicacion_id_idx on public.bajas_equipamiento (ubicacion_id);
create index bajas_equipamiento_equipo_idx on public.bajas_equipamiento (tipo_equipo, equipo_id);

alter table public.bajas_equipamiento enable row level security;

create policy bajas_equipamiento_select on public.bajas_equipamiento
  for select
  using (public.is_admin_or_supervisor());

create policy bajas_equipamiento_insert on public.bajas_equipamiento
  for insert
  with check (public.is_admin_or_supervisor());
