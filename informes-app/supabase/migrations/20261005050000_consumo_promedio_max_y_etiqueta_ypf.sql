-- ============================================================================
-- Corrige dos problemas reales encontrados al probar "Consumo estimado por
-- IA" (incremento anterior, 20261005040000):
--
-- 1. Un solo número de Watts no alcanza: la IA devolvió 65W para una
--    notebook Lenovo — ese es el vatiaje de la FUENTE/CARGADOR (lo máximo
--    que puede entregar), no lo que la notebook consume en uso normal (muy
--    por debajo de eso la mayoría del tiempo). Se separa en dos columnas:
--    `consumo_promedio_w` (uso normal) y `consumo_max_w` (pico/máximo, que
--    sí puede acercarse al vatiaje nominal de la fuente en algunos casos,
--    pero no es automáticamente lo mismo).
--
--    `consumo_estimado_w` queda DEPRECADA (sin usar en código nuevo) en vez
--    de borrada — un `DROP COLUMN` quedó bloqueado por la protección de
--    statements destructivos de esta sesión (mismo bloqueo que ya pasó con
--    2 filas huérfanas de Ubicaciones, ver migración
--    20261005030000_fusionar_salas_comunicaciones_refineria.sql) — queda
--    pendiente borrarla de verdad el día que se pueda.
--
-- 2. La etiqueta de inventario de YPF (una chapa/sticker propia de la
--    empresa, distinta de la marca/modelo o el número de serie del
--    fabricante) se estaba leyendo mezclada dentro de "texto" en vez de en
--    su propio campo — mismo criterio que ya tiene numero_serie, separado.
--
-- Se migró a mano con `execute_sql` (no `apply_migration`, que dio timeout)
-- — registrado en `supabase_migrations.schema_migrations` aparte, mismo
-- criterio ya usado en este proyecto para migraciones aplicadas así.
-- ============================================================================

alter table public.rack_equipamientos
  add column consumo_promedio_w numeric,
  add column consumo_max_w numeric,
  add column etiqueta_ypf text;

comment on column public.rack_equipamientos.consumo_estimado_w is
  'Deprecado — reemplazado por consumo_promedio_w/consumo_max_w (20261005050000). No usar en código nuevo.';
comment on column public.rack_equipamientos.consumo_promedio_w is
  'Consumo ESTIMADO por IA en Watts en uso normal (no un pico) — nunca una medición real.';
comment on column public.rack_equipamientos.consumo_max_w is
  'Consumo máximo/pico ESTIMADO por IA en Watts — puede acercarse al vatiaje nominal de la fuente del equipo, pero no es necesariamente el mismo número.';
comment on column public.rack_equipamientos.etiqueta_ypf is
  'Número de la etiqueta/chapa de inventario de YPF, si es legible — distinta del número de serie del fabricante.';

alter table public.equipos
  add column consumo_promedio_w numeric,
  add column consumo_max_w numeric,
  add column etiqueta_ypf text;

comment on column public.equipos.consumo_estimado_w is
  'Deprecado — reemplazado por consumo_promedio_w/consumo_max_w (20261005050000). No usar en código nuevo.';
comment on column public.equipos.consumo_promedio_w is
  'Consumo ESTIMADO por IA en Watts en uso normal (no un pico) — nunca una medición real.';
comment on column public.equipos.consumo_max_w is
  'Consumo máximo/pico ESTIMADO por IA en Watts — puede acercarse al vatiaje nominal de la fuente del equipo, pero no es necesariamente el mismo número.';
comment on column public.equipos.etiqueta_ypf is
  'Número de la etiqueta/chapa de inventario de YPF, si es legible — distinta del número de serie del fabricante.';

-- Backfill de la única fila de prueba real que ya tenía datos (notebook
-- Lenovo, "texto" con la etiqueta YPF mezclada adentro, consumo_estimado_w
-- 65W que en realidad era el vatiaje del cargador): se separa la etiqueta
-- a su columna propia y se limpia el texto; los dos consumos nuevos quedan
-- en null para que se re-estimen con el prompt nuevo (que ya distingue
-- consumo real de vatiaje de fuente) en vez de arrastrar el valor viejo,
-- que no se sabe si corresponde a consumo real o a la fuente.
update public.equipos
set
  etiqueta_ypf = '582432',
  texto = 'Notebook Lenovo (Model: 21G1S0RJ00)'
where id = 'd38be0dd-66ed-4346-8cb0-11965a3ff6d3';
