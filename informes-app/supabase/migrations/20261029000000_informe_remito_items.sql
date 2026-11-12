-- Trazabilidad de materiales a granel (cañería, bulonería, cable — cosas
-- que NO se dan de alta como equipo individual con marca/modelo/serie,
-- ver informe_materiales/equipos para eso). Hoy la lista completa del
-- remito (payload.remitoItems) solo queda impresa en el PDF del informe —
-- esto la guarda como filas reales, para poder buscar después "¿dónde se
-- usó tal material?" sin tener que abrir PDFs uno por uno.
create table public.informe_remito_items (
  id uuid primary key default gen_random_uuid(),
  informe_id uuid not null references public.informes_tecnicos(id) on delete cascade,
  descripcion text not null,
  cantidad_esperada numeric not null default 0,
  cantidad_sobrante numeric not null default 0,
  created_at timestamptz not null default now()
);

create index informe_remito_items_informe_id_idx on public.informe_remito_items (informe_id);

alter table public.informe_remito_items enable row level security;

-- Mismo criterio que informe_materiales: el acceso se resuelve por el dueño
-- del informe padre, no por columna propia.
create policy "informe_remito_items_own" on public.informe_remito_items
  for all using (
    exists (select 1 from public.informes_tecnicos i where i.id = informe_id and i.created_by = (select auth.uid()))
  ) with check (
    exists (select 1 from public.informes_tecnicos i where i.id = informe_id and i.created_by = (select auth.uid()))
  );

create policy "informe_remito_items_select_stats" on public.informe_remito_items
  for select using (public.is_admin_or_supervisor());
