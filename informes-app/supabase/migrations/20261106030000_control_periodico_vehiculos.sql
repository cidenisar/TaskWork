-- ============================================================================
-- Auditoría/control periódico de vehículos: el usuario pidió un recordatorio
-- por TIEMPO (ej. "cada mes", no solo por kilometraje, que ya existía vía
-- INTERVALO_SERVICE_KM en lib/config/fleet-alerts.ts) y que cada control
-- compare el estado del vehículo contra el anterior y avise inconsistencias
-- (no solo kilometraje) — mismo patrón de "estimación con IA, siempre
-- sugerencia revisable" que ya usa el alta del vehículo.
-- ============================================================================

alter table public.config_general
  add column vehiculo_control_frecuencia_dias integer not null default 30;

alter table public.vehiculo_services
  add column fotos_exterior_urls text[],
  add column estado_general text,
  add column tiene_danios boolean,
  add column inconsistencias_detectadas text;
