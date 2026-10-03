-- ============================================================================
-- Equipos Individuales — equipamiento suelto de un sitio que NO vive dentro
-- de un Rack ni de un Tablero (UPS standalone, cámaras, control de acceso,
-- impresoras, climatización, etc.).
--
-- A diferencia de Racks/Tableros, acá no hay un "contenedor" con varios
-- componentes internos: cada equipo es su propia entidad, atada directo a
-- la Ubicación. La categoría la identifica la IA a partir de la foto (ver
-- /api/equipos/leer-foto) en vez de haber un módulo dedicado por tipo de
-- equipo — así sumar un tipo nuevo de equipamiento suelto no requiere
-- tabla/migración nueva, solo ampliar el enum si hace falta una categoría
-- que hoy cae en "otro".
-- ============================================================================

create type public.equipo_categoria as enum (
  'ups',
  'banco_baterias',
  'camara_cctv',
  'control_acceso',
  'impresora',
  'telefonia',
  'climatizacion',
  'otro'
);

create table public.equipos (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references public.ubicaciones (id),
  categoria_equipo public.equipo_categoria not null,
  texto text not null, -- etiqueta/nombre tal cual se lee o descripción visual, igual criterio que rack_equipamientos.texto
  marca_modelo text,
  numero_serie text,
  cantidad integer not null default 1,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- Un "relevamiento" es la visita donde se registran/reconfirman uno o más
-- equipos sueltos de la misma Ubicación en una sola sesión (mismo criterio
-- que Racks: varias fotos de la misma visita se combinan en un solo PDF).
create table public.equipo_relevamientos (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references public.ubicaciones (id),
  numero_generacion text not null unique,
  fecha date not null,
  created_by uuid not null references public.profiles (id),
  pdf_url text,
  pdf_generado_at timestamptz,
  foto_general_url text,
  created_at timestamptz not null default now()
);

create table public.equipo_relevamiento_lecturas (
  id uuid primary key default gen_random_uuid(),
  relevamiento_id uuid not null references public.equipo_relevamientos (id) on delete cascade,
  equipo_id uuid not null references public.equipos (id),
  estado text, -- "Funciona"/"No funciona"/"Revisar"
  comentario text
);

create index equipos_ubicacion_id_idx on public.equipos (ubicacion_id);
create index equipo_relevamientos_ubicacion_id_idx on public.equipo_relevamientos (ubicacion_id);
create index equipo_relevamiento_lecturas_relevamiento_id_idx on public.equipo_relevamiento_lecturas (relevamiento_id);
create index equipo_relevamiento_lecturas_equipo_id_idx on public.equipo_relevamiento_lecturas (equipo_id);

alter table public.equipos enable row level security;
alter table public.equipo_relevamientos enable row level security;
alter table public.equipo_relevamiento_lecturas enable row level security;

-- equipos: catálogo compartido, alta al vuelo por cualquier usuario
-- autenticado (igual que racks/rack_equipamientos); solo un Admin edita/
-- borra para corregir errores de carga.
create policy "equipos_select" on public.equipos for select using ((select auth.uid()) is not null);
create policy "equipos_insert" on public.equipos for insert with check ((select auth.uid()) is not null);
create policy "equipos_admin_update" on public.equipos for update using (public.is_admin());
create policy "equipos_admin_delete" on public.equipos for delete using (public.is_admin());

-- equipo_relevamientos / lecturas: igual criterio que rack_relevamientos —
-- el creador ve las suyas, Admin/Supervisor ven todas.
create policy "equipo_relevamientos_select_own" on public.equipo_relevamientos
  for select using (created_by = (select auth.uid()) or public.is_admin_or_supervisor());
create policy "equipo_relevamientos_insert_own" on public.equipo_relevamientos
  for insert with check (created_by = (select auth.uid()));

create policy "equipo_relevamiento_lecturas_select" on public.equipo_relevamiento_lecturas
  for select using (
    exists (
      select 1 from public.equipo_relevamientos r
      where r.id = relevamiento_id and (r.created_by = (select auth.uid()) or public.is_admin_or_supervisor())
    )
  );
create policy "equipo_relevamiento_lecturas_insert" on public.equipo_relevamiento_lecturas
  for insert with check (
    exists (select 1 from public.equipo_relevamientos r where r.id = relevamiento_id and r.created_by = (select auth.uid()))
  );

-- El PDF reusa el bucket informes-pdf y la foto general reusa informe-fotos
-- (path {userId}/equipos/{relevamientoId}/...), igual criterio que Racks —
-- no hace falta storage nuevo.
