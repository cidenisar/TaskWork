-- Distingue una programación generada por el algoritmo automático
-- (Configuración → "Generar programación automática") de una cargada a
-- mano por un técnico como excepción puntual — al regenerar, solo se
-- reemplazan las filas 'auto', las 'manual' nunca se tocan.
alter table public.mantenimiento_programaciones
  add column if not exists origen text not null default 'manual' check (origen in ('manual', 'auto'));
