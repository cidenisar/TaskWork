-- ============================================================================
-- Hallazgos de seguridad al relevar un tablero — catálogo configurable
-- (Configuración → Catálogos, admin-editable) de cosas a revisar en la foto
-- del tablero además de identificar los circuitos (ej. "Térmica bypaseada
-- sin candado", "Cables pelados o sin tapa de terminal") — mismo criterio
-- que mantenimiento_checklist_items: catálogo abierto, un Admin agrega o
-- quita ítems sin tocar código.
--
-- La lectura con IA de la foto del tablero (/api/tableros/leer-foto)
-- evalúa cada ítem del catálogo contra las fotos y propone un estado — el
-- técnico lo revisa/corrige en el formulario antes de guardar, igual
-- criterio que los circuitos detectados. Reusa los mismos 3 valores de
-- estado (ok/no_ok/no_aplica) que ya usa `mantenimiento_checklist_
-- respuestas.estado`, en vez de inventar un enum nuevo: "no_ok" = se
-- detectó el hallazgo (hay un problema), "ok" = no se detectó,
-- "no_aplica" = la foto no permite evaluarlo.
-- ============================================================================

create table public.catalogo_hallazgos_seguridad_tablero (
  id uuid primary key default gen_random_uuid(),
  orden integer not null default 0,
  texto text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.tablero_medicion_hallazgos (
  id uuid primary key default gen_random_uuid(),
  medicion_id uuid not null references public.tablero_mediciones (id) on delete cascade,
  item_id uuid not null references public.catalogo_hallazgos_seguridad_tablero (id),
  estado text not null check (estado in ('ok', 'no_ok', 'no_aplica')),
  comentario text,
  unique (medicion_id, item_id)
);
create index tablero_medicion_hallazgos_medicion_idx on public.tablero_medicion_hallazgos (medicion_id);

alter table public.catalogo_hallazgos_seguridad_tablero enable row level security;
alter table public.tablero_medicion_hallazgos enable row level security;

-- Igual criterio que mantenimiento_checklist_items: catálogo de
-- configuración, lectura abierta, solo Admin lo edita.
create policy "catalogo_hallazgos_seguridad_tablero_select" on public.catalogo_hallazgos_seguridad_tablero
  for select using ((select auth.uid()) is not null);
create policy "catalogo_hallazgos_seguridad_tablero_admin_insert" on public.catalogo_hallazgos_seguridad_tablero
  for insert with check (public.is_admin());
create policy "catalogo_hallazgos_seguridad_tablero_admin_delete" on public.catalogo_hallazgos_seguridad_tablero
  for delete using (public.is_admin());

-- Igual criterio que tablero_medicion_lecturas: visible/insertable junto
-- con la medición que las generó (RLS de tablero_mediciones ya resuelve
-- quién puede verla — acá solo hace falta que la medición exista y sea
-- del creador para poder insertar).
create policy "tablero_medicion_hallazgos_select" on public.tablero_medicion_hallazgos
  for select using (
    exists (
      select 1 from public.tablero_mediciones m
      where m.id = medicion_id and (m.created_by = (select auth.uid()) or public.is_admin_or_supervisor())
    )
  );
create policy "tablero_medicion_hallazgos_insert" on public.tablero_medicion_hallazgos
  for insert with check (
    exists (select 1 from public.tablero_mediciones m where m.id = medicion_id and m.created_by = (select auth.uid()))
  );

-- Catálogo inicial — hallazgos de seguridad eléctrica y estado del
-- gabinete realmente verificables desde una foto; un Admin agrega/quita
-- ítems después desde Configuración → Catálogos sin tocar código.
insert into public.catalogo_hallazgos_seguridad_tablero (orden, texto) values
(1, 'Térmica bypaseada/puenteada sin candado de bloqueo'),
(2, 'Terminal con dos cables en un mismo borne (doble conexión)'),
(3, 'Cables pelados o terminales sin tapa aislante'),
(4, 'Espacios vacíos en el riel sin tapa ciega (bus expuesto)'),
(5, 'Marcas de quemado o decoloración en térmicas, borneras o cableado'),
(6, 'Cable de tierra ausente o visiblemente desconectado'),
(7, 'Puerta o tapa del gabinete rota, sin cerradura, o faltante'),
(8, 'Cartel de riesgo eléctrico ausente'),
(9, 'Cableado desordenado, sin canalizar'),
(10, 'Corrosión, humedad u óxido visible dentro del gabinete');
