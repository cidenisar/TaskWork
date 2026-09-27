-- ============================================================================
-- Tableros: distinguir Medición de Relevamiento, y agregar Mantenimiento.
--
-- Medición vs. Relevamiento son la misma grilla por circuito (mismas tablas
-- tablero_mediciones/tablero_medicion_lecturas) — la diferencia es solo si
-- se pide corriente por fase (medición) o no (relevamiento, un chequeo más
-- liviano). Mantenimiento es una entidad aparte: no es una lectura por
-- circuito, es un registro de trabajo realizado (como vehiculo_services),
-- con circuito afectado opcional, foto opcional, y próximo mantenimiento
-- programado opcional (para un futuro aviso tipo Vencimientos).
-- ============================================================================

create type public.tablero_evento_tipo as enum ('medicion', 'relevamiento');

alter table public.tablero_mediciones
  add column tipo_evento public.tablero_evento_tipo not null default 'medicion';

create table public.tablero_mantenimientos (
  id uuid primary key default gen_random_uuid(),
  tablero_id uuid not null references public.tableros (id) on delete cascade,
  circuito_id uuid references public.tablero_circuitos (id),
  fecha date not null,
  descripcion text not null,
  foto_url text,
  proximo_mantenimiento date,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index tablero_mantenimientos_tablero_id_idx on public.tablero_mantenimientos (tablero_id);
create index tablero_mantenimientos_circuito_id_idx on public.tablero_mantenimientos (circuito_id);

alter table public.tablero_mantenimientos enable row level security;

-- Mismo criterio que tablero_mediciones: el creador ve las suyas,
-- Admin/Supervisor ven todas.
create policy "tablero_mantenimientos_select_own" on public.tablero_mantenimientos
  for select using (created_by = (select auth.uid()) or public.is_admin_or_supervisor());
create policy "tablero_mantenimientos_insert_own" on public.tablero_mantenimientos
  for insert with check (created_by = (select auth.uid()));

-- La foto de mantenimiento se sube al bucket informe-fotos ya existente
-- (path {userId}/tableros/mantenimiento/...) — mismas policies de
-- insert/select/delete "own" por carpeta de usuario que ya cubren ese
-- bucket, y el select de Admin/Supervisor (informe_fotos_select_stats) ya
-- lo alcanza también. No hace falta storage nuevo.
