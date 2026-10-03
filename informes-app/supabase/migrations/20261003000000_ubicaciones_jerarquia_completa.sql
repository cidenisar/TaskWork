-- Reemplaza el modelo "Provincia → Sector/Oficina → Sala" (hecho antes de tener
-- a mano el catálogo real de sitios) por la jerarquía completa que usa la
-- operación: País → Región (zonificación interna, ej. NOA/NEA/SUR) →
-- Provincia → Localidad → Sitio → Planta → Oficina (el último nivel, más
-- fino, siempre a mano porque no viene en ningún catálogo). Pensado para
-- que a futuro la Región/Provincia/Localidad se completen solas por GPS, y
-- Sitio/Planta se acoten a una lista corta en vez de elegir entre miles.

alter table public.catalogo_provincias add column region text;
-- La pantalla genérica de Configuración → Catálogos inserta provincias
-- nuevas con solo {nombre} (no pide región) — con este default no se rompe
-- esa alta rápida; el admin puede corregir la región después si hace falta.
alter table public.catalogo_provincias alter column region set default 'Sin especificar';

update public.catalogo_provincias set region = 'NEA'
  where nombre in ('Buenos Aires', 'CABA', 'Chaco', 'Corrientes', 'Entre Ríos', 'Formosa', 'La Pampa', 'Misiones', 'Santa Fe');
update public.catalogo_provincias set region = 'NOA'
  where nombre in ('Catamarca', 'Córdoba', 'Jujuy', 'La Rioja', 'Mendoza', 'Salta', 'San Juan', 'San Luis', 'Santiago del Estero', 'Tucumán');
update public.catalogo_provincias set region = 'SUR'
  where nombre in ('Chubut', 'Neuquén', 'Río Negro', 'Santa Cruz', 'Tierra del Fuego');

alter table public.catalogo_provincias alter column region set not null;

alter table public.ubicaciones rename column sala to sitio;
alter table public.ubicaciones rename column sector_oficina to oficina;
alter table public.ubicaciones add column pais text not null default 'Argentina';
alter table public.ubicaciones add column region text;
alter table public.ubicaciones add column localidad text;
alter table public.ubicaciones add column planta text;
alter table public.ubicaciones add column lat double precision;
alter table public.ubicaciones add column lng double precision;
alter table public.ubicaciones add column gps_accuracy_m double precision;
alter table public.ubicaciones add column gps_confirmado_at timestamptz;
alter table public.ubicaciones add column gps_confirmado_por uuid references public.profiles (id);

-- Las ubicaciones existentes (todas de prueba) se completan con la región
-- que les corresponda por provincia; las que tengan una provincia que no
-- está en el catálogo (ej. "Sin especificar", texto de prueba) quedan con
-- región "Sin especificar" en vez de romper la carga.
update public.ubicaciones u set region = cp.region
  from public.catalogo_provincias cp where cp.nombre = u.provincia;
update public.ubicaciones set region = 'Sin especificar' where region is null;
alter table public.ubicaciones alter column region set not null;

alter table public.ubicaciones drop constraint ubicaciones_provincia_sector_oficina_sala_key;
alter table public.ubicaciones add constraint ubicaciones_pais_provincia_localidad_sitio_planta_oficina_key
  unique (pais, provincia, localidad, sitio, planta, oficina);

create index ubicaciones_lat_lng_idx on public.ubicaciones (lat, lng) where lat is not null;
