-- ============================================================================
-- Plan de Mantenimiento (PDM): intervalos configurables por categoría de
-- equipo + registro de mantenimientos realizados.
--
-- Reusa a propósito `public.tipo_equipo_baja` (ya compartido por Bajas de
-- Equipamiento y Entregas a Depósito — ver 20261005080000_entregas_
-- deposito.sql) en vez de crear un enum nuevo: es el mismo "a cuál tabla
-- de equipamiento apunta esta fila" que necesita Mantenimientos — el enum
-- en sí sigue teniendo sus 3 valores, la app solo restringe cuáles ofrece.
--
-- Alcance de esta primera entrega: SOLO Racks y Equipos Individuales.
-- Tableros queda AFUERA a propósito: ya tiene su propio sistema de
-- mantenimiento (`tablero_mantenimientos`, con fecha de próxima visita
-- cargada a mano por el técnico en `/tableros/mantenimiento`) — construir
-- uno paralelo acá habría sido la misma duplicación que ya se evitó antes
-- en esta sesión (ver CRITERIOS_Y_IDEAS.md). Torres de Comunicaciones
-- queda afuera por el mismo motivo que en Bajas/Entregas: todavía no
-- tiene su propia sección en la ficha de Sitio.
--
-- "Categoría" se guarda como texto libre (no un enum tipado) porque cada
-- tipo_equipo tiene su PROPIO enum de categoría (RackCategoriaEquipo /
-- EquipoCategoria) — no hay un solo tipo Postgres que sirva para los dos
-- a la vez. Se valida en código contra el enum correcto según
-- tipo_equipo, mismo criterio que el campo `estado` de varias tablas de
-- equipamiento.
-- ============================================================================

create table public.mantenimiento_intervalos (
  id uuid primary key default gen_random_uuid(),
  tipo_equipo public.tipo_equipo_baja not null,
  categoria text not null,
  frecuencia_dias integer not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (tipo_equipo, categoria)
);

create table public.mantenimientos_equipamiento (
  id uuid primary key default gen_random_uuid(),
  tipo_equipo public.tipo_equipo_baja not null,
  equipo_id uuid not null,
  fecha date not null,
  descripcion text,
  foto_url text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index mantenimientos_equipamiento_equipo_idx on public.mantenimientos_equipamiento (tipo_equipo, equipo_id);

alter table public.mantenimiento_intervalos enable row level security;
alter table public.mantenimientos_equipamiento enable row level security;

-- mantenimiento_intervalos: catálogo de configuración — solo un Admin lo
-- edita (mismo criterio que el resto de los catálogos de Configuración),
-- lectura abierta (el Panel y la ficha de Sitio necesitan verlo).
create policy "mantenimiento_intervalos_select" on public.mantenimiento_intervalos for select using ((select auth.uid()) is not null);
create policy "mantenimiento_intervalos_admin_insert" on public.mantenimiento_intervalos for insert with check (public.is_admin());
create policy "mantenimiento_intervalos_admin_delete" on public.mantenimiento_intervalos for delete using (public.is_admin());

-- mantenimientos_equipamiento: lo carga cualquier técnico en el campo
-- (igual criterio que un relevamiento, no es una decisión operativa como
-- Bajas/Entregas a Depósito) — select/insert abiertos a cualquier
-- autenticado, solo un Admin puede borrar un registro para corregir un
-- error de carga.
create policy "mantenimientos_equipamiento_select" on public.mantenimientos_equipamiento for select using ((select auth.uid()) is not null);
create policy "mantenimientos_equipamiento_insert" on public.mantenimientos_equipamiento for insert with check ((select auth.uid()) is not null);
create policy "mantenimientos_equipamiento_admin_delete" on public.mantenimientos_equipamiento for delete using (public.is_admin());

-- La foto (opcional) reusa el bucket informe-fotos, path
-- {userId}/mantenimientos/{id}.jpg, igual criterio que el resto de la app
-- — no hace falta storage nuevo.
