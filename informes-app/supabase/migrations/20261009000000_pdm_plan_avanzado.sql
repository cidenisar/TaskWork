-- PDM v2: programación manual de mantenimiento (fecha planeada + técnico
-- asignado, por si la visita real no coincide con lo que da el cálculo del
-- intervalo) + supuestos configurables para estimar cuántos técnicos hacen
-- falta para cumplir el plan. Mismo criterio de "nunca inventar un dato
-- externo" ya usado en esta app: la estimación de dotación usa distancias
-- REALES entre sitios (ya tenemos lat/lng en Ubicaciones) y supuestos que
-- carga un Admin, nunca un número que la IA "calcule" de memoria.

create table public.mantenimiento_programaciones (
  id uuid primary key default gen_random_uuid(),
  tipo_equipo public.tipo_equipo_baja not null,
  equipo_id uuid not null,
  fecha_programada date not null,
  asignado_a uuid references public.profiles (id),
  nota text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (tipo_equipo, equipo_id)
);

create index mantenimiento_programaciones_equipo_idx on public.mantenimiento_programaciones (tipo_equipo, equipo_id);

alter table public.mantenimiento_programaciones enable row level security;

-- Igual criterio que mantenimientos_equipamiento: cualquier autenticado
-- puede programar/reprogramar (es trabajo de campo normal), solo un Admin
-- borra una programación para corregir un error de carga.
create policy "mantenimiento_programaciones_select" on public.mantenimiento_programaciones for select using ((select auth.uid()) is not null);
create policy "mantenimiento_programaciones_insert" on public.mantenimiento_programaciones for insert with check ((select auth.uid()) is not null);
create policy "mantenimiento_programaciones_update" on public.mantenimiento_programaciones for update using ((select auth.uid()) is not null);
create policy "mantenimiento_programaciones_admin_delete" on public.mantenimiento_programaciones for delete using (public.is_admin());

-- Supuestos para la estimación de dotación (Configuración → Mantenimiento) —
-- valores por defecto razonables, un Admin los ajusta a la realidad real
-- de la cuadrilla.
alter table public.config_general
  add column if not exists pdm_horas_por_dia numeric not null default 8,
  add column if not exists pdm_dias_habiles_anio integer not null default 230,
  add column if not exists pdm_horas_por_visita numeric not null default 2,
  add column if not exists pdm_velocidad_kmh numeric not null default 60;
