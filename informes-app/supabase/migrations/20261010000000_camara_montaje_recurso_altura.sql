-- Montaje de cámaras/domos (Equipos Individuales, categoría camara_cctv):
-- dónde está instalada y a qué altura — para poder determinar qué recurso
-- hace falta para el mantenimiento (grupo de altura para torres siempre;
-- escalera o andamio/manlift según la altura real en columna/poste/pared/
-- techo). Nunca inventado por IA: lo carga el técnico a mano al relevar el
-- equipo, mismo criterio que la distancia real (Dotación) y el largo de
-- tramo real (Torres) de esta sesión.
create type public.tipo_montaje_camara as enum ('torre', 'columna', 'poste', 'pared', 'techo', 'otro');
create type public.recurso_altura_mantenimiento as enum ('escalera', 'andamio_manlift', 'grupo_altura');

alter table public.equipos
  add column if not exists tipo_montaje public.tipo_montaje_camara,
  add column if not exists altura_montaje_m numeric;

-- Catálogo admin-configurable: qué recurso hace falta según el tipo de
-- montaje y la altura real cargada. "recurso_fijo" (ej. torre ->
-- grupo_altura) ignora la altura — un trabajo en torre siempre necesita el
-- equipo de altura especializado, no es una decisión de altura. Si
-- "recurso_fijo" es null, se decide por "umbral_escalera_m": hasta esa
-- altura inclusive, Escalera; por encima, Andamio/Manlift. Mismo patrón
-- que mantenimiento_intervalos/torre_tipo_largos: id uuid PK + unique en
-- la clave natural (nunca la clave natural como PK directa — ver
-- CRITERIOS_Y_IDEAS.md), policy de update desde el arranque.
create table public.catalogo_recurso_altura (
  id uuid primary key default gen_random_uuid(),
  tipo_montaje public.tipo_montaje_camara not null unique,
  recurso_fijo public.recurso_altura_mantenimiento,
  umbral_escalera_m numeric check (umbral_escalera_m is null or umbral_escalera_m > 0),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

alter table public.catalogo_recurso_altura enable row level security;
create policy "catalogo_recurso_altura_select" on public.catalogo_recurso_altura for select using ((select auth.uid()) is not null);
create policy "catalogo_recurso_altura_admin_insert" on public.catalogo_recurso_altura for insert with check (public.is_admin());
create policy "catalogo_recurso_altura_admin_update" on public.catalogo_recurso_altura for update using (public.is_admin());
create policy "catalogo_recurso_altura_admin_delete" on public.catalogo_recurso_altura for delete using (public.is_admin());

-- Valores por defecto razonables (nunca inventados por IA, un Admin los
-- ajusta en Configuración → Catálogos → Recurso por altura) — "otro"
-- queda sin umbral configurado a propósito, no hay una regla estándar
-- para un montaje sin tipificar todavía.
insert into public.catalogo_recurso_altura (tipo_montaje, recurso_fijo, umbral_escalera_m) values
  ('torre', 'grupo_altura', null),
  ('columna', null, 4),
  ('poste', null, 4),
  ('pared', null, 4),
  ('techo', null, 3),
  ('otro', null, null);
