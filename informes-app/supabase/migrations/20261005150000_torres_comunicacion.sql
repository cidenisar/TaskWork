-- ============================================================================
-- Relevamiento de Torres de Comunicaciones.
--
-- Mismo patrón que Racks (alta al vuelo de la torre, lista de equipamiento
-- cargada una vez y releveada en cada visita, historial con PDF) pero para
-- lo que va montado en una torre (antenas, radioenlaces, baliza, etc.) en
-- vez de en un rack de sala técnica. La posición de cada equipo se registra
-- como altura en metros (texto libre, ej. "24m") en vez de una posición "U".
--
-- Nombrado "torre_comunicacion" (no simplemente "torre") a propósito: en
-- esta app "torre" ya significa otra cosa — la cuadrilla/turno de un
-- técnico (`profiles.torre`, `catalogo_torres`, usado en Informe Técnico y
-- Rendición de Gastos) — son dos conceptos físicos totalmente distintos que
-- comparten la palabra en español, así que el nombre de tabla/columna los
-- separa para no confundir a quien lea el código.
--
-- Fotos generales desde el día 1 como array (`fotos_generales_urls`), no
-- una sola — ya aprendimos esa lección con Racks/Informe Técnico/Entregas a
-- Depósito en esta misma sesión, no hace falta repetir la migración doble.
-- ============================================================================

create type public.torre_comunicacion_categoria_equipo as enum (
  'antena',
  'radioenlace',
  'antena_celular',
  'baliza',
  'pararrayos',
  'cableado_feeder',
  'otro'
);

create table public.torres_comunicacion (
  id uuid primary key default gen_random_uuid(),
  denominacion text not null,
  ubicacion_id uuid not null references public.ubicaciones (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.torre_comunicacion_equipamientos (
  id uuid primary key default gen_random_uuid(),
  torre_id uuid not null references public.torres_comunicacion (id) on delete cascade,
  numero integer not null,
  categoria_equipo public.torre_comunicacion_categoria_equipo not null,
  texto text not null, -- etiqueta/nombre tal cual se lee o descripción visual, igual criterio que rack_equipamientos.texto
  marca_modelo text,
  altura_m text, -- altura en la torre, texto libre (ej. "24m" o "18.5") — no siempre se puede medir con precisión en el momento
  etiqueta_ypf text,
  cantidad integer not null default 1,
  consumo_promedio_w numeric,
  consumo_max_w numeric,
  estado text not null default 'activo',
  created_at timestamptz not null default now()
);

-- Una "relevamiento" es el evento de una visita — igual estructura que rack_relevamientos.
create table public.torre_comunicacion_relevamientos (
  id uuid primary key default gen_random_uuid(),
  torre_id uuid not null references public.torres_comunicacion (id) on delete restrict,
  numero_generacion text not null unique,
  fecha date not null,
  created_by uuid not null references public.profiles (id),
  pdf_url text,
  pdf_generado_at timestamptz,
  fotos_generales_urls text[],
  created_at timestamptz not null default now()
);

create table public.torre_comunicacion_relevamiento_lecturas (
  id uuid primary key default gen_random_uuid(),
  relevamiento_id uuid not null references public.torre_comunicacion_relevamientos (id) on delete cascade,
  equipamiento_id uuid not null references public.torre_comunicacion_equipamientos (id),
  estado text, -- "Funciona"/"No funciona"/"Revisar"
  comentario text
);

create index torre_comunicacion_equipamientos_torre_id_idx on public.torre_comunicacion_equipamientos (torre_id);
create index torre_comunicacion_relevamientos_torre_id_idx on public.torre_comunicacion_relevamientos (torre_id);
create index torre_comunicacion_relev_lecturas_relevamiento_id_idx on public.torre_comunicacion_relevamiento_lecturas (relevamiento_id);
create index torre_comunicacion_relev_lecturas_equipamiento_id_idx on public.torre_comunicacion_relevamiento_lecturas (equipamiento_id);

alter table public.torres_comunicacion enable row level security;
alter table public.torre_comunicacion_equipamientos enable row level security;
alter table public.torre_comunicacion_relevamientos enable row level security;
alter table public.torre_comunicacion_relevamiento_lecturas enable row level security;

-- torres_comunicacion / torre_comunicacion_equipamientos: catálogo
-- compartido, alta al vuelo por cualquier usuario autenticado (igual que
-- racks/rack_equipamientos); solo un Admin edita/borra para corregir
-- errores de carga.
create policy "torres_comunicacion_select" on public.torres_comunicacion for select using ((select auth.uid()) is not null);
create policy "torres_comunicacion_insert" on public.torres_comunicacion for insert with check ((select auth.uid()) is not null);
create policy "torres_comunicacion_admin_update" on public.torres_comunicacion for update using (public.is_admin());
create policy "torres_comunicacion_admin_delete" on public.torres_comunicacion for delete using (public.is_admin());

create policy "torre_comunicacion_equipamientos_select" on public.torre_comunicacion_equipamientos for select using ((select auth.uid()) is not null);
create policy "torre_comunicacion_equipamientos_insert" on public.torre_comunicacion_equipamientos for insert with check ((select auth.uid()) is not null);
create policy "torre_comunicacion_equipamientos_admin_update" on public.torre_comunicacion_equipamientos for update using (public.is_admin());
create policy "torre_comunicacion_equipamientos_admin_delete" on public.torre_comunicacion_equipamientos for delete using (public.is_admin());

-- torre_comunicacion_relevamientos / lecturas: igual criterio que
-- rack_relevamientos — el creador ve las suyas, Admin/Supervisor ven todas.
create policy "torre_comunicacion_relevamientos_select_own" on public.torre_comunicacion_relevamientos
  for select using (created_by = (select auth.uid()) or public.is_admin_or_supervisor());
create policy "torre_comunicacion_relevamientos_insert_own" on public.torre_comunicacion_relevamientos
  for insert with check (created_by = (select auth.uid()));

create policy "torre_comunicacion_relev_lecturas_select" on public.torre_comunicacion_relevamiento_lecturas
  for select using (
    exists (
      select 1 from public.torre_comunicacion_relevamientos r
      where r.id = relevamiento_id and (r.created_by = (select auth.uid()) or public.is_admin_or_supervisor())
    )
  );
create policy "torre_comunicacion_relev_lecturas_insert" on public.torre_comunicacion_relevamiento_lecturas
  for insert with check (
    exists (select 1 from public.torre_comunicacion_relevamientos r where r.id = relevamiento_id and r.created_by = (select auth.uid()))
  );

-- El PDF reusa el bucket informes-pdf y las fotos generales reusan
-- informe-fotos (path {userId}/torres-comunicacion/{relevamientoId}/...),
-- igual criterio que Racks/Tableros — no hace falta storage nuevo.
