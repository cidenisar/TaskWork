-- ============================================================================
-- Relevamiento de Equipamiento — racks en sitios/salas/shelters.
--
-- Mismo patrón que Tableros (equipo físico relevado en el campo, alta al
-- vuelo, historial con PDF), pero para inventariar equipamiento de sala
-- técnica en vez de circuitos eléctricos: un Rack (equivalente al Tablero)
-- vive en un sitio/sala/shelter, y tiene una lista de equipamiento (router,
-- switch, rectificador, UPS, etc.) que se carga una vez y se relevea en
-- cada visita. A diferencia de Tableros no hay "tipo de circuito"/corriente
-- ni distinción Medición/Relevamiento — acá el objetivo es directamente el
-- inventario: qué hay, cuánto, y en qué posición del rack.
-- ============================================================================

create type public.rack_categoria_equipo as enum (
  'router',
  'switch',
  'servidor',
  'rectificador',
  'banco_baterias',
  'ups',
  'odf',
  'patch_panel',
  'radio_enlace',
  'convertidor_medios',
  'firewall',
  'multiplexor',
  'pdu_regleta',
  'otro'
);

create table public.racks (
  id uuid primary key default gen_random_uuid(),
  denominacion text not null,
  sitio text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.rack_equipamientos (
  id uuid primary key default gen_random_uuid(),
  rack_id uuid not null references public.racks (id) on delete cascade,
  numero integer not null,
  categoria_equipo public.rack_categoria_equipo not null,
  texto text not null, -- etiqueta/nombre tal cual se lee o descripción visual, igual criterio que tablero_circuitos.texto
  marca_modelo text,
  posicion_u text, -- ej. "U12" o "U12-U14" si ocupa varias — texto libre, no siempre es legible/aplica
  cantidad integer not null default 1,
  created_at timestamptz not null default now()
);

-- Una "relevamiento" es el evento de una visita — igual estructura que
-- tablero_mediciones, sin tipo_evento porque acá solo hay un tipo de visita.
create table public.rack_relevamientos (
  id uuid primary key default gen_random_uuid(),
  rack_id uuid not null references public.racks (id) on delete restrict,
  numero_generacion text not null unique,
  fecha date not null,
  created_by uuid not null references public.profiles (id),
  pdf_url text,
  pdf_generado_at timestamptz,
  foto_general_url text,
  created_at timestamptz not null default now()
);

create table public.rack_relevamiento_lecturas (
  id uuid primary key default gen_random_uuid(),
  relevamiento_id uuid not null references public.rack_relevamientos (id) on delete cascade,
  equipamiento_id uuid not null references public.rack_equipamientos (id),
  estado text, -- "Funciona"/"No funciona"/"Revisar"
  comentario text
);

create index rack_equipamientos_rack_id_idx on public.rack_equipamientos (rack_id);
create index rack_relevamientos_rack_id_idx on public.rack_relevamientos (rack_id);
create index rack_relevamiento_lecturas_relevamiento_id_idx on public.rack_relevamiento_lecturas (relevamiento_id);
create index rack_relevamiento_lecturas_equipamiento_id_idx on public.rack_relevamiento_lecturas (equipamiento_id);

alter table public.racks enable row level security;
alter table public.rack_equipamientos enable row level security;
alter table public.rack_relevamientos enable row level security;
alter table public.rack_relevamiento_lecturas enable row level security;

-- racks / rack_equipamientos: catálogo compartido, alta al vuelo por
-- cualquier usuario autenticado (igual que tableros/tablero_circuitos);
-- solo un Admin edita/borra para corregir errores de carga.
create policy "racks_select" on public.racks for select using ((select auth.uid()) is not null);
create policy "racks_insert" on public.racks for insert with check ((select auth.uid()) is not null);
create policy "racks_admin_update" on public.racks for update using (public.is_admin());
create policy "racks_admin_delete" on public.racks for delete using (public.is_admin());

create policy "rack_equipamientos_select" on public.rack_equipamientos for select using ((select auth.uid()) is not null);
create policy "rack_equipamientos_insert" on public.rack_equipamientos for insert with check ((select auth.uid()) is not null);
create policy "rack_equipamientos_admin_update" on public.rack_equipamientos for update using (public.is_admin());
create policy "rack_equipamientos_admin_delete" on public.rack_equipamientos for delete using (public.is_admin());

-- rack_relevamientos / lecturas: igual criterio que tablero_mediciones — el
-- creador ve las suyas, Admin/Supervisor ven todas.
create policy "rack_relevamientos_select_own" on public.rack_relevamientos
  for select using (created_by = (select auth.uid()) or public.is_admin_or_supervisor());
create policy "rack_relevamientos_insert_own" on public.rack_relevamientos
  for insert with check (created_by = (select auth.uid()));

create policy "rack_relevamiento_lecturas_select" on public.rack_relevamiento_lecturas
  for select using (
    exists (
      select 1 from public.rack_relevamientos r
      where r.id = relevamiento_id and (r.created_by = (select auth.uid()) or public.is_admin_or_supervisor())
    )
  );
create policy "rack_relevamiento_lecturas_insert" on public.rack_relevamiento_lecturas
  for insert with check (
    exists (select 1 from public.rack_relevamientos r where r.id = relevamiento_id and r.created_by = (select auth.uid()))
  );

-- El PDF reusa el bucket informes-pdf y la foto general reusa informe-fotos
-- (path {userId}/racks/{relevamientoId}/...), igual criterio que Tableros
-- — no hace falta storage nuevo.
