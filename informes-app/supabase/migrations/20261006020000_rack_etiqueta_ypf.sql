-- Etiqueta/chapa de inventario de YPF del RACK EN SÍ (la que se usa para
-- numerarlo en ServiceNow) — distinta de la denominación (nombre
-- descriptivo libre) y de la etiqueta YPF de cada equipo individual
-- adentro del rack (rack_equipamientos.etiqueta_ypf, ya existente).
alter table public.racks
  add column if not exists etiqueta_ypf text;
