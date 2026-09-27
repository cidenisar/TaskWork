-- ============================================================================
-- Tableros (Energía / CCTV / Control de Acceso) — relevamiento en campo.
--
-- Un tablero es equipo físico instalado en la ubicación de un cliente (como
-- catalogo_vehiculos), con una lista de circuitos/elementos fija (número,
-- texto, y para energía el amperaje nominal del interruptor). Cada visita
-- se carga como una "medición" (para energía: corriente por fase F/R/S/T;
-- para CCTV/control de acceso: solo estado + comentario) que reemplaza la
-- planilla Excel manual y genera un PDF.
--
-- A diferencia de catalogo_vehiculos (ficha 100% admin, spec: activo físico
-- de la empresa con documentación legal), el tablero se releva en el campo
-- la primera vez que un técnico lo encuentra — mismo criterio de "alta al
-- vuelo" que catalogo_clientes/catalogo_torres — así que cualquier usuario
-- autenticado puede crear tableros y cargar circuitos, no solo un Admin.
-- ============================================================================

create type public.tablero_tipo as enum ('energia', 'cctv', 'control_acceso');

create table public.tableros (
  id uuid primary key default gen_random_uuid(),
  tipo public.tablero_tipo not null,
  denominacion text not null,
  sitio text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.tablero_circuitos (
  id uuid primary key default gen_random_uuid(),
  tablero_id uuid not null references public.tableros (id) on delete cascade,
  numero integer not null,
  texto text not null,
  amp_nominal text, -- solo tiene sentido para tipo='energia'; se guarda tal cual ("63A") como marca_modelo en vehículos
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

-- Una "medición" es el evento de una visita — fecha + quién la cargó. Para
-- energía es literalmente una medición de consumo; para CCTV/control de
-- acceso es un relevamiento de estado, pero es la misma estructura.
create table public.tablero_mediciones (
  id uuid primary key default gen_random_uuid(),
  tablero_id uuid not null references public.tableros (id) on delete restrict,
  numero_generacion text not null unique,
  fecha date not null,
  created_by uuid not null references public.profiles (id),
  pdf_url text,
  pdf_generado_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.tablero_medicion_lecturas (
  id uuid primary key default gen_random_uuid(),
  medicion_id uuid not null references public.tablero_mediciones (id) on delete cascade,
  circuito_id uuid not null references public.tablero_circuitos (id),
  estado text, -- energía: "Cerrado"/"Abierto"/"Disparado"; CCTV/acceso: "Funciona"/"No funciona"/"Revisar"
  corriente_f numeric,
  corriente_r numeric,
  corriente_s numeric,
  corriente_t numeric,
  comentario text
);

create index tablero_circuitos_tablero_id_idx on public.tablero_circuitos (tablero_id);
create index tablero_mediciones_tablero_id_idx on public.tablero_mediciones (tablero_id);
create index tablero_medicion_lecturas_medicion_id_idx on public.tablero_medicion_lecturas (medicion_id);
create index tablero_medicion_lecturas_circuito_id_idx on public.tablero_medicion_lecturas (circuito_id);

alter table public.tableros enable row level security;
alter table public.tablero_circuitos enable row level security;
alter table public.tablero_mediciones enable row level security;
alter table public.tablero_medicion_lecturas enable row level security;

-- tableros / tablero_circuitos: catálogo compartido, alta al vuelo por
-- cualquier usuario autenticado (igual que catalogo_clientes/catalogo_torres);
-- solo un Admin edita/borra para poder corregir errores de carga.
create policy "tableros_select" on public.tableros for select using ((select auth.uid()) is not null);
create policy "tableros_insert" on public.tableros for insert with check ((select auth.uid()) is not null);
create policy "tableros_admin_update" on public.tableros for update using (public.is_admin());
create policy "tableros_admin_delete" on public.tableros for delete using (public.is_admin());

create policy "tablero_circuitos_select" on public.tablero_circuitos for select using ((select auth.uid()) is not null);
create policy "tablero_circuitos_insert" on public.tablero_circuitos for insert with check ((select auth.uid()) is not null);
create policy "tablero_circuitos_admin_update" on public.tablero_circuitos for update using (public.is_admin());
create policy "tablero_circuitos_admin_delete" on public.tablero_circuitos for delete using (public.is_admin());

-- tablero_mediciones / lecturas: igual criterio que informes_tecnicos — el
-- creador ve las suyas, Admin/Supervisor ven todas (spec Estadísticas).
create policy "tablero_mediciones_select_own" on public.tablero_mediciones
  for select using (created_by = (select auth.uid()) or public.is_admin_or_supervisor());
create policy "tablero_mediciones_insert_own" on public.tablero_mediciones
  for insert with check (created_by = (select auth.uid()));

create policy "tablero_medicion_lecturas_select" on public.tablero_medicion_lecturas
  for select using (
    exists (
      select 1 from public.tablero_mediciones m
      where m.id = medicion_id and (m.created_by = (select auth.uid()) or public.is_admin_or_supervisor())
    )
  );
create policy "tablero_medicion_lecturas_insert" on public.tablero_medicion_lecturas
  for insert with check (
    exists (select 1 from public.tablero_mediciones m where m.id = medicion_id and m.created_by = (select auth.uid()))
  );
