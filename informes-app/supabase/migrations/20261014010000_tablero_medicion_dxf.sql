-- Esquema unifilar exportado a DXF (AutoCAD) — se genera junto con el PDF
-- en cada medición/relevamiento, a partir de los mismos circuitos ya
-- relevados (nunca un plano a escala real, ver comentario en
-- lib/tableros/unifilar.ts). Mismo bucket que el PDF (informes-pdf).
alter table public.tablero_mediciones
  add column dxf_url text;
