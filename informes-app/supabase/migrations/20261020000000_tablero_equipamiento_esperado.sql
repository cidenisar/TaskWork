-- Checklist de equipamiento esperado del tablero, cargado UNA VEZ al darlo
-- de alta (antes de sacar fotos), no por visita — la composición física de
-- un tablero (si tiene UPS, fuente industrial, conversor DC, etc.) no
-- cambia entre visitas, mismo criterio que `subsistemas`. Sirve como
-- ayuda-memoria para el técnico y como contexto de desambiguación para la
-- IA de leer-foto (ver route.ts): si ya se sabe que el tablero tiene bypass
-- de UPS, la IA puede interpretar mejor un trío de térmicas parecidas en
-- vez de adivinar a ciegas si son bypass o 3 circuitos sueltos.
alter table public.tableros
  add column equipamiento_esperado public.tablero_categoria_equipo[] not null default '{}',
  add column tiene_bypass_ups boolean not null default false;
