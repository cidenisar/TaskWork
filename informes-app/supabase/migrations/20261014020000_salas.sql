-- ============================================================================
-- Relevamiento de Salas / Shelters — el AMBIENTE físico en sí (una sala
-- interior, un shelter, un container) que alberga equipamiento, distinto
-- de los Tableros/Racks/Equipos que ya se relevan dentro de él. El alta es
-- el relevamiento (una vez: denominación, tipo de construcción, fotos); las
-- visitas siguientes son mantenimiento (limpieza, obra civil, arreglos) —
-- misma distinción alta/mantenimiento que ya usa el resto de la app, así
-- que no hace falta una tabla de "relevamientos" repetidos como en
-- Tableros/Racks/Torres: una sola fila por sala alcanza, y el historial de
-- visitas lo lleva el Plan de Mantenimiento genérico (ver más abajo).
-- ============================================================================

create type public.sala_tipo_construccion as enum ('sala_interior', 'shelter', 'container', 'otro');

create table public.salas (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references public.ubicaciones (id),
  denominacion text not null,
  tipo_construccion public.sala_tipo_construccion not null,
  estado text not null default 'activo' check (estado in ('activo', 'baja')),
  numero_generacion text not null unique,
  fotos_generales_urls text[],
  pdf_url text,
  pdf_generado_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index salas_ubicacion_id_idx on public.salas (ubicacion_id);

alter table public.salas enable row level security;

-- Mismo criterio que tableros/torres_comunicacion: catálogo compartido,
-- visible en la ficha de Sitio para cualquiera, alta al vuelo por
-- cualquier autenticado, solo un Admin corrige/borra.
create policy "salas_select" on public.salas for select using ((select auth.uid()) is not null);
create policy "salas_insert" on public.salas for insert with check ((select auth.uid()) is not null);
create policy "salas_admin_update" on public.salas for update using (public.is_admin());
create policy "salas_admin_delete" on public.salas for delete using (public.is_admin());

-- El PDF y las fotos generales reusan los buckets informes-pdf/informe-fotos
-- (path {userId}/salas/{salaId}/...), igual criterio que el resto de los
-- módulos — no hace falta storage nuevo.

-- ============================================================================
-- Plan de Mantenimiento: sumar 'sala' como un tercer tipo de equipo, SIN
-- tocar `tipo_equipo_baja` (el enum que comparten Bajas de Equipamiento y
-- Entregas a Depósito) — una sala no se "da de baja" como una pieza suelta
-- ni se "entrega a depósito", así que forzarla en ese enum le agregaría una
-- opción sin sentido a esas dos pantallas. En vez de eso, el Plan de
-- Mantenimiento pasa a tener su PROPIO enum (`tipo_equipo_mantenimiento`),
-- hoy con los mismos 2 valores que ya usaba (rack_equipamiento,
-- equipo_individual) más 'sala' — las 4 tablas que lo usan se migran de
-- tipo con un ALTER ... USING (cast por texto, mismos nombres de valor).
-- ============================================================================

create type public.tipo_equipo_mantenimiento as enum ('rack_equipamiento', 'equipo_individual', 'sala');

alter table public.mantenimiento_intervalos
  alter column tipo_equipo type public.tipo_equipo_mantenimiento using tipo_equipo::text::public.tipo_equipo_mantenimiento;

alter table public.mantenimientos_equipamiento
  alter column tipo_equipo type public.tipo_equipo_mantenimiento using tipo_equipo::text::public.tipo_equipo_mantenimiento;

alter table public.mantenimiento_programaciones
  alter column tipo_equipo type public.tipo_equipo_mantenimiento using tipo_equipo::text::public.tipo_equipo_mantenimiento;

alter table public.mantenimiento_checklist_items
  alter column tipo_equipo type public.tipo_equipo_mantenimiento using tipo_equipo::text::public.tipo_equipo_mantenimiento;

-- Checklist inicial para Salas — un primer set genérico (limpieza, obra
-- civil, instalaciones) que sirve para los 3 tipos de construcción; un
-- Admin puede diferenciarlo por tipo después desde Configuración si hace
-- falta (ej. un container tiene checks de corrosión que una sala interior
-- no necesita) sin tocar código.
insert into public.mantenimiento_checklist_items (tipo_equipo, categoria, orden, texto) values
('sala', 'sala_interior', 1, 'Limpieza general (piso, paredes, superficies)'),
('sala', 'sala_interior', 2, 'Estado de paredes, piso y techo (fisuras, humedad, desprendimientos)'),
('sala', 'sala_interior', 3, 'Puerta/cerramiento: cierre, llave, estado'),
('sala', 'sala_interior', 4, 'Iluminación funcionando'),
('sala', 'sala_interior', 5, 'Climatización/ventilación funcionando'),
('sala', 'sala_interior', 6, 'Sin filtraciones de agua ni humedad'),
('sala', 'sala_interior', 7, 'Señalética y orden (libre de obstrucciones)'),
('sala', 'sala_interior', 8, 'Sistema de detección/extinción de incendio (si tiene) en condiciones'),
('sala', 'shelter', 1, 'Limpieza general (piso, paredes, superficies)'),
('sala', 'shelter', 2, 'Estado de paredes, piso y techo (fisuras, humedad, desprendimientos)'),
('sala', 'shelter', 3, 'Puerta/cerramiento: cierre, llave, estado'),
('sala', 'shelter', 4, 'Iluminación funcionando'),
('sala', 'shelter', 5, 'Climatización/ventilación funcionando'),
('sala', 'shelter', 6, 'Sin filtraciones de agua ni humedad'),
('sala', 'shelter', 7, 'Señalética y orden (libre de obstrucciones)'),
('sala', 'shelter', 8, 'Sistema de detección/extinción de incendio (si tiene) en condiciones'),
('sala', 'container', 1, 'Limpieza general (piso, paredes, superficies)'),
('sala', 'container', 2, 'Estado de paredes, piso y techo (fisuras, humedad, desprendimientos)'),
('sala', 'container', 3, 'Puerta/cerramiento: cierre, llave, estado'),
('sala', 'container', 4, 'Iluminación funcionando'),
('sala', 'container', 5, 'Climatización/ventilación funcionando'),
('sala', 'container', 6, 'Sin filtraciones de agua ni humedad'),
('sala', 'container', 7, 'Señalética y orden (libre de obstrucciones)'),
('sala', 'container', 8, 'Sistema de detección/extinción de incendio (si tiene) en condiciones'),
('sala', 'container', 9, 'Estado de chapa/estructura exterior (corrosión, golpes)');
