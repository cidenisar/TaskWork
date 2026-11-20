-- ============================================================================
-- Consumo estimado por IA en Racks y Equipos Individuales.
--
-- Los tableros de energía ya tienen consumo REAL medido (corriente_f/r/s/t
-- en tablero_medicion_lecturas, cargada a mano con un instrumento) — pero el
-- equipamiento de Racks y Equipos Individuales (routers, UPS, rectificadores,
-- cámaras...) no se mide con un instrumento en el relevamiento. Para poder
-- armar más adelante una estimación de consumo energético que cubra TODO el
-- equipamiento de un sitio (no solo lo que tiene térmica), se agrega un campo
-- de potencia ESTIMADA por IA a partir de la marca/modelo identificada —
-- nunca una medición real, por eso va en una columna separada y claramente
-- distinta de los campos de lectura real de Tableros.
--
-- Nullable: la mayoría del equipamiento ya cargado no tiene este valor
-- todavía (se completa a futuro con un backfill o al re-relevar).
-- ============================================================================

alter table public.rack_equipamientos
  add column consumo_estimado_w numeric;

comment on column public.rack_equipamientos.consumo_estimado_w is
  'Potencia típica ESTIMADA por IA en Watts a partir de la marca/modelo identificada — nunca una medición real. Null si la IA no reconoció el modelo con confianza suficiente.';

alter table public.equipos
  add column consumo_estimado_w numeric;

comment on column public.equipos.consumo_estimado_w is
  'Potencia típica ESTIMADA por IA en Watts a partir de la marca/modelo identificada — nunca una medición real. Null si la IA no reconoció el modelo con confianza suficiente.';
