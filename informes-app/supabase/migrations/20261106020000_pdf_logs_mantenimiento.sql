-- ============================================================================
-- Los 3 "logs de trabajo realizado" de la app (mantenimiento de Tablero,
-- Service de Vehículos, y el Plan de Mantenimiento genérico de Racks/
-- Equipos/Salas) nunca generaban PDF a propósito — eran más livianos que un
-- relevamiento completo. El usuario pidió que también generen PDF (son
-- registros de lo que se hizo, igual que el resto) para poder mandarlos por
-- mail como todos los demás módulos. Se agregan las mismas 3 columnas que
-- ya tiene cualquier otra tabla que genera PDF — numero_generacion queda
-- nullable (no hay backfill de lo ya cargado, que se queda sin PDF).
-- ============================================================================

alter table public.tablero_mantenimientos
  add column numero_generacion text unique,
  add column pdf_url text,
  add column pdf_generado_at timestamptz;

alter table public.vehiculo_services
  add column numero_generacion text unique,
  add column pdf_url text,
  add column pdf_generado_at timestamptz;

alter table public.mantenimientos_equipamiento
  add column numero_generacion text unique,
  add column pdf_url text,
  add column pdf_generado_at timestamptz;
