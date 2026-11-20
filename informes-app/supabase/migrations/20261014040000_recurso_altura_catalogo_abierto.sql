-- ============================================================================
-- Recurso por altura: de un enum fijo (escalera/andamio_manlift/
-- grupo_altura) a un catálogo abierto — un Admin puede sumar un recurso
-- nuevo (ej. "Andamóvil") sin que haga falta una migración/deploy nueva.
-- Mismo patrón (id, nombre) que catalogo_torres/catalogo_clientes, así que
-- reusa el componente SimpleCatalogTab tal cual.
--
-- También reemplaza el único "umbral_escalera_m" (una sola frontera entre
-- Escalera y Andamio/Manlift) por una lista de BANDAS ascendentes por
-- tipo_montaje — mismo criterio que catalogo_calibre_cable: "hasta tantos
-- metros, tal recurso"; permite escalonar Escalera → Andamóvil →
-- Andamio/Manlift (o cualquier otra secuencia) sin código nuevo.
-- ============================================================================

create table public.catalogo_tipos_recurso_altura (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);
alter table public.catalogo_tipos_recurso_altura enable row level security;
create policy "catalogo_tipos_recurso_altura_select" on public.catalogo_tipos_recurso_altura for select using ((select auth.uid()) is not null);
create policy "catalogo_tipos_recurso_altura_admin_insert" on public.catalogo_tipos_recurso_altura for insert with check (public.is_admin());
create policy "catalogo_tipos_recurso_altura_admin_delete" on public.catalogo_tipos_recurso_altura for delete using (public.is_admin());

insert into public.catalogo_tipos_recurso_altura (nombre) values
  ('Escalera'), ('Andamio/Manlift'), ('Grupo de altura'), ('Andamóvil');

-- recurso_fijo pasa de enum a texto libre (el nombre tal cual está en el
-- catálogo de arriba) — se migran los 3 valores existentes a su label.
alter table public.catalogo_recurso_altura add column recurso_fijo_texto text;
update public.catalogo_recurso_altura set recurso_fijo_texto = case recurso_fijo
  when 'escalera' then 'Escalera'
  when 'andamio_manlift' then 'Andamio/Manlift'
  when 'grupo_altura' then 'Grupo de altura'
  else null
end;
alter table public.catalogo_recurso_altura drop column recurso_fijo;
alter table public.catalogo_recurso_altura rename column recurso_fijo_texto to recurso_fijo;
drop type public.recurso_altura_mantenimiento;

-- Bandas por altura — reemplaza umbral_escalera_m. Se busca la banda más
-- chica cuyo altura_hasta_m alcance a cubrir la altura real (igual
-- criterio que calcularCalibreCable); si la altura supera todas las
-- bandas configuradas, no hay regla (nunca se inventa un recurso).
create table public.catalogo_recurso_altura_bandas (
  id uuid primary key default gen_random_uuid(),
  tipo_montaje public.tipo_montaje_camara not null,
  altura_hasta_m numeric not null check (altura_hasta_m > 0),
  recurso text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (tipo_montaje, altura_hasta_m)
);
alter table public.catalogo_recurso_altura_bandas enable row level security;
create policy "catalogo_recurso_altura_bandas_select" on public.catalogo_recurso_altura_bandas for select using ((select auth.uid()) is not null);
create policy "catalogo_recurso_altura_bandas_admin_insert" on public.catalogo_recurso_altura_bandas for insert with check (public.is_admin());
create policy "catalogo_recurso_altura_bandas_admin_delete" on public.catalogo_recurso_altura_bandas for delete using (public.is_admin());

-- Migra cada umbral_escalera_m existente a DOS bandas equivalentes, para
-- no cambiar el comportamiento ya configurado: hasta ese umbral ->
-- Escalera; por encima (banda "catch-all" a 9999m) -> Andamio/Manlift,
-- igual que el ">umbral" fijo de antes. Quedan como filas normales que un
-- Admin puede editar después (ej. partir esa segunda banda agregando
-- Andamóvil en el medio).
insert into public.catalogo_recurso_altura_bandas (tipo_montaje, altura_hasta_m, recurso)
select tipo_montaje, umbral_escalera_m, 'Escalera'
from public.catalogo_recurso_altura
where umbral_escalera_m is not null;

insert into public.catalogo_recurso_altura_bandas (tipo_montaje, altura_hasta_m, recurso)
select tipo_montaje, 9999, 'Andamio/Manlift'
from public.catalogo_recurso_altura
where umbral_escalera_m is not null;

alter table public.catalogo_recurso_altura drop column umbral_escalera_m;
