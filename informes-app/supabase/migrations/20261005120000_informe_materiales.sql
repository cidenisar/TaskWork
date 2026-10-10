-- Reemplaza el módulo standalone "Instalación" (tabla `instalaciones`,
-- nunca usado en producción, recién agregado en la migración anterior) por
-- una capacidad "Materiales" DENTRO de Informe Técnico: el usuario detectó
-- que cargar una Instalación Y, aparte, un Informe Técnico para la misma
-- visita era redundante — y que "materiales usados" no es exclusivo de una
-- instalación (una reparación también puede usar materiales). En vez de un
-- módulo paralelo, Informe Técnico gana una sección opcional de materiales
-- que, al guardarse, da de alta equipo real en `equipos` (no solo un
-- registro de constancia) y linkea opcionalmente a un remito.
--
-- NOTA: `drop table public.instalaciones;` quedó afuera de esta migración
-- a propósito — el `DROP TABLE` específicamente (no otro DDL: CREATE/ALTER
-- de este mismo archivo se aplicaron sin problema) quedó colgado repetidas
-- veces vía las herramientas de Supabase en esta sesión, con diagnóstico
-- hecho (sin locks en pg_locks, sin queries bloqueantes en
-- pg_stat_activity) — parece un problema puntual de la herramienta, no de
-- la base. La tabla queda huérfana (sin RLS tocada, sin datos reales, sin
-- código de la app que la referencie después de este cambio) hasta poder
-- correr el DROP TABLE a mano o cuando la herramienta ande: `drop table
-- public.instalaciones; drop table public._ping_test;` (esta última
-- también quedó huérfana, de una prueba de diagnóstico).
alter table public.informes_tecnicos
  add column remito_foto_url text,
  add column remito_numero text,
  add column entrega_deposito_numero_generacion text;

create table public.informe_materiales (
  id uuid primary key default gen_random_uuid(),
  informe_id uuid not null references public.informes_tecnicos(id) on delete cascade,
  categoria_equipo public.equipo_categoria not null default 'otro',
  descripcion text not null,
  marca_modelo text,
  numero_serie text,
  etiqueta_ypf text,
  cantidad integer not null default 1,
  consumo_promedio_w integer,
  consumo_max_w integer,
  comentario text,
  -- El equipo real que se dio de alta en `equipos` para este material —
  -- siempre se crea uno nuevo (Informe Técnico no tiene un picker de
  -- "equipo ya existente", a diferencia de Equipos Individuales).
  equipo_id uuid references public.equipos(id),
  created_at timestamptz not null default now()
);

create index informe_materiales_informe_id_idx on public.informe_materiales (informe_id);

alter table public.informe_materiales enable row level security;

-- Mismo criterio que informe_tecnicos_asignados/informe_vehiculos: el
-- acceso se resuelve por el dueño del informe padre, no por columna propia.
create policy "informe_materiales_own" on public.informe_materiales
  for all using (
    exists (select 1 from public.informes_tecnicos i where i.id = informe_id and i.created_by = (select auth.uid()))
  ) with check (
    exists (select 1 from public.informes_tecnicos i where i.id = informe_id and i.created_by = (select auth.uid()))
  );

-- Mismo criterio que informe_imagenes_select_stats: Admin/Supervisor ven
-- los materiales de cualquier informe, no solo el propio.
create policy "informe_materiales_select_stats" on public.informe_materiales
  for select using (public.is_admin_or_supervisor());
