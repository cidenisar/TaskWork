-- N° de serie de fábrica del equipo (distinto de etiqueta_ypf, que es la
-- chapa de inventario de YPF) — campo manual u opcionalmente leído con IA
-- (lectura general o escaneo puntual de un solo campo).
alter table public.rack_equipamientos
  add column if not exists numero_serie text;
