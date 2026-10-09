-- Checklist de mantenimiento por categoría de equipo — catálogo de ítems
-- (admin-configurable, Panel → Mantenimientos → Configuración) + las
-- respuestas quedan guardadas junto al mantenimiento que las generó.
-- "categoria" es texto libre, igual criterio que mantenimiento_intervalos
-- (cada tipo_equipo tiene su propio enum de categoría — no hay un tipo
-- Postgres único que sirva para los dos a la vez).
create table public.mantenimiento_checklist_items (
  id uuid primary key default gen_random_uuid(),
  tipo_equipo public.tipo_equipo_baja not null,
  categoria text not null,
  orden integer not null default 0,
  texto text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index mantenimiento_checklist_items_categoria_idx on public.mantenimiento_checklist_items (tipo_equipo, categoria);

create table public.mantenimiento_checklist_respuestas (
  id uuid primary key default gen_random_uuid(),
  mantenimiento_id uuid not null references public.mantenimientos_equipamiento (id) on delete cascade,
  item_id uuid not null references public.mantenimiento_checklist_items (id),
  estado text not null check (estado in ('ok', 'no_ok', 'no_aplica')),
  observacion text,
  unique (mantenimiento_id, item_id)
);
create index mantenimiento_checklist_respuestas_mantenimiento_idx on public.mantenimiento_checklist_respuestas (mantenimiento_id);

alter table public.mantenimiento_checklist_items enable row level security;
alter table public.mantenimiento_checklist_respuestas enable row level security;

-- Igual criterio que mantenimiento_intervalos: catálogo de configuración,
-- lectura abierta, solo Admin lo edita.
create policy "mantenimiento_checklist_items_select" on public.mantenimiento_checklist_items for select using ((select auth.uid()) is not null);
create policy "mantenimiento_checklist_items_admin_insert" on public.mantenimiento_checklist_items for insert with check (public.is_admin());
create policy "mantenimiento_checklist_items_admin_delete" on public.mantenimiento_checklist_items for delete using (public.is_admin());

-- Igual criterio que mantenimientos_equipamiento: lo carga cualquier
-- técnico en el campo junto con el mantenimiento, solo Admin borra para
-- corregir un error de carga.
create policy "mantenimiento_checklist_respuestas_select" on public.mantenimiento_checklist_respuestas for select using ((select auth.uid()) is not null);
create policy "mantenimiento_checklist_respuestas_insert" on public.mantenimiento_checklist_respuestas for insert with check ((select auth.uid()) is not null);
create policy "mantenimiento_checklist_respuestas_admin_delete" on public.mantenimiento_checklist_respuestas for delete using (public.is_admin());

-- Contenido inicial investigado para las 6 categorías más comunes en
-- sitios de YPF — un Admin puede agregar/quitar ítems después sin tocar
-- código (Panel → Mantenimientos → Configuración).
insert into public.mantenimiento_checklist_items (tipo_equipo, categoria, orden, texto) values
('rack_equipamiento', 'ups', 1, 'Tensión de entrada y salida dentro de rango'),
('rack_equipamiento', 'ups', 2, 'Estado y antigüedad de la batería'),
('rack_equipamiento', 'ups', 3, 'Prueba de transferencia a batería (corte simulado)'),
('rack_equipamiento', 'ups', 4, 'Alarmas activas en el display'),
('rack_equipamiento', 'ups', 5, 'Filtros/ventilación limpios'),
('rack_equipamiento', 'ups', 6, 'Ajuste de bornes y conexiones'),
('equipo_individual', 'ups', 1, 'Tensión de entrada y salida dentro de rango'),
('equipo_individual', 'ups', 2, 'Estado y antigüedad de la batería'),
('equipo_individual', 'ups', 3, 'Prueba de transferencia a batería (corte simulado)'),
('equipo_individual', 'ups', 4, 'Alarmas activas en el display'),
('equipo_individual', 'ups', 5, 'Filtros/ventilación limpios'),
('equipo_individual', 'ups', 6, 'Ajuste de bornes y conexiones'),
('equipo_individual', 'grupo_electrogeno', 1, 'Nivel de aceite de motor'),
('equipo_individual', 'grupo_electrogeno', 2, 'Nivel de refrigerante'),
('equipo_individual', 'grupo_electrogeno', 3, 'Nivel de combustible'),
('equipo_individual', 'grupo_electrogeno', 4, 'Tensión de batería de arranque'),
('equipo_individual', 'grupo_electrogeno', 5, 'Prueba de arranque manual'),
('equipo_individual', 'grupo_electrogeno', 6, 'Prueba de arranque automático (si tiene transferencia automática)'),
('equipo_individual', 'grupo_electrogeno', 7, 'Fugas visibles de aceite/combustible/refrigerante'),
('equipo_individual', 'grupo_electrogeno', 8, 'Estado de correas y mangueras'),
('equipo_individual', 'grupo_electrogeno', 9, 'Horas acumuladas (horómetro)'),
('equipo_individual', 'grupo_electrogeno', 10, 'Estado de filtros (aire/aceite/combustible)'),
('equipo_individual', 'grupo_electrogeno', 11, 'Escape sin obstrucciones ni fugas'),
('rack_equipamiento', 'banco_baterias', 1, 'Tensión por celda o por banco'),
('rack_equipamiento', 'banco_baterias', 2, 'Estado físico (hinchazón, corrosión en bornes)'),
('rack_equipamiento', 'banco_baterias', 3, 'Limpieza de bornes'),
('rack_equipamiento', 'banco_baterias', 4, 'Temperatura del recinto'),
('equipo_individual', 'banco_baterias', 1, 'Tensión por celda o por banco'),
('equipo_individual', 'banco_baterias', 2, 'Estado físico (hinchazón, corrosión en bornes)'),
('equipo_individual', 'banco_baterias', 3, 'Limpieza de bornes'),
('equipo_individual', 'banco_baterias', 4, 'Temperatura del recinto'),
('rack_equipamiento', 'rectificador', 1, 'Tensión de salida'),
('rack_equipamiento', 'rectificador', 2, 'Corriente de carga'),
('rack_equipamiento', 'rectificador', 3, 'Alarmas activas'),
('rack_equipamiento', 'rectificador', 4, 'Ventilación/filtros'),
('rack_equipamiento', 'radio_enlace', 1, 'Alineación visual de la antena'),
('rack_equipamiento', 'radio_enlace', 2, 'Nivel de señal (RSSI) si es medible'),
('rack_equipamiento', 'radio_enlace', 3, 'Conectores y cableado en buen estado'),
('rack_equipamiento', 'radio_enlace', 4, 'Fijación mecánica sin corrosión ni holgura'),
('equipo_individual', 'camara_cctv', 1, 'Imagen nítida / enfoque correcto'),
('equipo_individual', 'camara_cctv', 2, 'Housing sin humedad ni daños visibles'),
('equipo_individual', 'camara_cctv', 3, 'Fijación mecánica firme'),
('equipo_individual', 'camara_cctv', 4, 'Cableado y conectores en buen estado');
