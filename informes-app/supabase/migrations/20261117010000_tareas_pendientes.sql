-- ============================================================================
-- Tareas pendientes como filas (pedido de Ivan, 17/11/2026). Hasta ahora eran
-- un solo campo de texto por informe (informes_tecnicos.tareas_pendientes, una
-- línea por tarea): no se podían contar, agrupar por ubicación ni cerrar.
--
-- Una fila por tarea, siempre colgada de una Ubicación (así se cuentan por
-- región / provincia / localidad / sitio). Se crean y sincronizan solas desde el
-- informe (lib/tareas/sincronizar.ts); la oficina las resuelve o da de baja
-- desde Panel → Tareas pendientes. El campo de texto del informe NO se toca:
-- el PDF sigue siendo la foto de lo que se escribió ese día.
--
-- Cerrar una tarea nunca se pierde: queda con motivo, comentario, quién y
-- cuándo (y se puede reabrir). Una tarea cerrada no la toca la sincronización.
-- ============================================================================

create table public.tareas_pendientes (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references public.ubicaciones(id) on delete cascade,
  -- Informe donde se anotó. Si se borra el informe (limpieza de datos de prueba), se van con él.
  informe_id uuid references public.informes_tecnicos(id) on delete cascade,
  texto text not null check (length(trim(texto)) > 0),
  estado text not null default 'abierta' check (estado in ('abierta', 'resuelta', 'descartada')),
  motivo_cierre text check (motivo_cierre in ('resuelta_en_visita', 'resuelta_aparte', 'equipo_dado_de_baja', 'ya_no_aplica', 'duplicada')),
  comentario_cierre text,
  cerrada_at timestamptz,
  cerrada_por uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- abierta <=> sin fecha de cierre: ninguna acción puede dejarla a medias.
  constraint tareas_pendientes_cierre_coherente check ((estado = 'abierta') = (cerrada_at is null))
);

create index tareas_pendientes_ubicacion_estado_idx on public.tareas_pendientes (ubicacion_id, estado);
create index tareas_pendientes_informe_idx on public.tareas_pendientes (informe_id);
create index tareas_pendientes_estado_creada_idx on public.tareas_pendientes (estado, created_at desc);
create index tareas_pendientes_cerrada_por_idx on public.tareas_pendientes (cerrada_por);
create index tareas_pendientes_created_by_idx on public.tareas_pendientes (created_by);

-- "¿Soy el dueño de este informe?" en una función security definer y no como
-- subquery en la policy: así no depende de las policies de informes_tecnicos ni
-- hay columnas ambiguas (CRITERIOS_Y_IDEAS §3).
create or replace function public.es_dueno_del_informe(p_informe_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from public.informes_tecnicos i where i.id = p_informe_id and i.created_by = auth.uid());
$$;

alter table public.tareas_pendientes enable row level security;

-- Cualquier usuario logueado las ve (el técnico va a ver los pendientes del sitio al abrir un informe).
create policy "tareas_pendientes_select" on public.tareas_pendientes
  for select using ((select auth.uid()) is not null);

-- Las crea el dueño del informe (la sincronización corre con su sesión) o la oficina.
create policy "tareas_pendientes_insert" on public.tareas_pendientes
  for insert with check (public.is_admin_or_supervisor() or public.es_dueno_del_informe(informe_id));

-- Cerrar / reabrir: solo la oficina. El dueño del informe solo puede tocar las ABIERTAS
-- (y dejarlas abiertas): lo que necesita la sincronización al editar el informe.
create policy "tareas_pendientes_update_oficina" on public.tareas_pendientes
  for update using (public.is_admin_or_supervisor()) with check (public.is_admin_or_supervisor());
create policy "tareas_pendientes_update_dueno_abiertas" on public.tareas_pendientes
  for update using (estado = 'abierta' and public.es_dueno_del_informe(informe_id))
  with check (estado = 'abierta' and public.es_dueno_del_informe(informe_id));

create policy "tareas_pendientes_delete_oficina" on public.tareas_pendientes
  for delete using (public.is_admin_or_supervisor());
create policy "tareas_pendientes_delete_dueno_abiertas" on public.tareas_pendientes
  for delete using (estado = 'abierta' and public.es_dueno_del_informe(informe_id));
