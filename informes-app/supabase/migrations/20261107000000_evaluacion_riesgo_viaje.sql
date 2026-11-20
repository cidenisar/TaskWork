-- Evaluación de Riesgo del Viaje (Anexo IV) — formulario de puntaje fijo que
-- se completa antes de un viaje (8 criterios con opciones de punto fijo,
-- suma total y semáforo de resultado), con seguimiento del viaje en vivo
-- (iniciado / en punto medio / finalizado) para poder ver la EVOLUCIÓN del
-- riesgo en el tiempo (por vehículo, conductor o ruta) en el Panel.
-- Los puntajes de cada criterio y los umbrales del semáforo son los del
-- documento de seguridad original — no se inventan ni se ajustan acá.

create table public.evaluaciones_riesgo_viaje (
  id uuid primary key default gen_random_uuid(),
  numero_generacion text not null unique,
  vehiculo_id uuid not null references public.catalogo_vehiculos(id),
  conductor_nombre text not null,
  empresa text not null,
  fecha_hora timestamptz not null,
  origen text not null,
  destino text not null,
  -- Sugerido (no obligatorio) cuando el criterio de distancia es "Mayor 300 Km".
  punto_medio text,
  criterio_a_distancia integer not null,
  criterio_b_tiempo_viaje integer not null,
  criterio_c_clima integer not null,
  criterio_d_tipo_ruta integer not null,
  criterio_e_conocimiento integer not null,
  criterio_f_comunicacion integer not null,
  criterio_g_personas_vehiculo integer not null,
  criterio_h_horas_trabajadas integer not null,
  total integer not null,
  nivel_riesgo text not null check (nivel_riesgo in ('bajo', 'medio', 'alto')),
  mensaje_riesgo text not null,
  estado_viaje text not null default 'pendiente' check (estado_viaje in ('pendiente', 'iniciado', 'en_punto_medio', 'finalizado')),
  iniciado_at timestamptz,
  punto_medio_at timestamptz,
  finalizado_at timestamptz,
  pdf_url text,
  pdf_generado_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index evaluaciones_riesgo_viaje_vehiculo_idx on public.evaluaciones_riesgo_viaje(vehiculo_id);
create index evaluaciones_riesgo_viaje_created_by_idx on public.evaluaciones_riesgo_viaje(created_by);
create index evaluaciones_riesgo_viaje_fecha_hora_idx on public.evaluaciones_riesgo_viaje(fecha_hora);

create table public.evaluaciones_riesgo_viaje_acompanantes (
  id uuid primary key default gen_random_uuid(),
  evaluacion_id uuid not null references public.evaluaciones_riesgo_viaje(id) on delete cascade,
  nombre_completo text not null
);

create index evaluaciones_riesgo_viaje_acomp_evaluacion_idx on public.evaluaciones_riesgo_viaje_acompanantes(evaluacion_id);

alter table public.evaluaciones_riesgo_viaje enable row level security;
alter table public.evaluaciones_riesgo_viaje_acompanantes enable row level security;

create policy "evaluaciones_riesgo_viaje_select_own" on public.evaluaciones_riesgo_viaje
  for select using (created_by = (select auth.uid()));
create policy "evaluaciones_riesgo_viaje_select_stats" on public.evaluaciones_riesgo_viaje
  for select using (is_admin_or_supervisor());
create policy "evaluaciones_riesgo_viaje_insert" on public.evaluaciones_riesgo_viaje
  for insert with check (created_by = (select auth.uid()));
-- El estado del viaje (iniciado/punto medio/finalizado) lo actualiza quien lo
-- cargó, a medida que viaja — Admin/Supervisor puede corregirlo si hace falta.
create policy "evaluaciones_riesgo_viaje_update_own_or_admin" on public.evaluaciones_riesgo_viaje
  for update using (created_by = (select auth.uid()) or is_admin_or_supervisor())
  with check (created_by = (select auth.uid()) or is_admin_or_supervisor());

create policy "evaluaciones_riesgo_viaje_acomp_select" on public.evaluaciones_riesgo_viaje_acompanantes
  for select using (
    exists (
      select 1 from public.evaluaciones_riesgo_viaje e
      where e.id = evaluacion_id and (e.created_by = (select auth.uid()) or is_admin_or_supervisor())
    )
  );
create policy "evaluaciones_riesgo_viaje_acomp_insert" on public.evaluaciones_riesgo_viaje_acompanantes
  for insert with check (
    exists (
      select 1 from public.evaluaciones_riesgo_viaje e
      where e.id = evaluacion_id and e.created_by = (select auth.uid())
    )
  );
