-- Catálogo admin-configurable: a qué sección de cable (mm²) corresponde el
-- amperaje nominal de una térmica/disyuntor, para poder mostrarlo en el
-- esquema unifilar de Tableros. Nunca lo calcula la IA ni una fórmula propia
-- — es una tabla normativa (acá, AEA 90364 / IRAM 2183) que además depende
-- del método de instalación y la temperatura ambiente, así que esto es un
-- valor de referencia por defecto (cobre, aislación PVC, método B1 — cable
-- en caño), a VERIFICAR por un admin que conozca la norma/criterio real
-- usado en YPF antes de usarlo para dimensionar cableado real. Mismo
-- patrón que catalogo_recurso_altura/mantenimiento_intervalos: id uuid PK +
-- unique en la clave natural (nunca la clave natural como PK directa — ver
-- CRITERIOS_Y_IDEAS.md), policy de update desde el arranque.
--
-- Es una tabla de "bandas": cada fila dice "hasta este amperaje, este
-- calibre" — se busca la fila con el amperaje_max más chico que sea mayor o
-- igual al amperaje real de la térmica. Si el amperaje supera la fila más
-- alta configurada, no se inventa un calibre — se devuelve sin determinar.
create table public.catalogo_calibre_cable (
  id uuid primary key default gen_random_uuid(),
  amperaje_max numeric not null unique check (amperaje_max > 0),
  calibre_mm2 numeric not null check (calibre_mm2 > 0),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

alter table public.catalogo_calibre_cable enable row level security;
create policy "catalogo_calibre_cable_select" on public.catalogo_calibre_cable for select using ((select auth.uid()) is not null);
create policy "catalogo_calibre_cable_admin_insert" on public.catalogo_calibre_cable for insert with check (public.is_admin());
create policy "catalogo_calibre_cable_admin_update" on public.catalogo_calibre_cable for update using (public.is_admin());
create policy "catalogo_calibre_cable_admin_delete" on public.catalogo_calibre_cable for delete using (public.is_admin());

-- Valores de referencia (cobre, PVC, método B1) — ajustar en Configuración
-- → Catálogos → Calibre de cable según la norma real que uses.
insert into public.catalogo_calibre_cable (amperaje_max, calibre_mm2) values
  (15, 1.5),
  (21, 2.5),
  (28, 4),
  (36, 6),
  (50, 10),
  (68, 16),
  (89, 25),
  (110, 35),
  (134, 50),
  (171, 70),
  (207, 95),
  (239, 120),
  (299, 150);
