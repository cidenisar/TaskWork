-- Liquidación por semana de guardia (miércoles a miércoles), además de la
-- liquidación global del período más grande que ya existía — pedido de
-- Ivan: poder cerrar cada semana a medida que termina, y más adelante
-- cerrar el período global (que sigue calculándose en vivo, nunca a partir
-- de las fotos semanales — "derivados, no guardados", HANDOFF §11).
-- Reusa la misma tabla `guardia_periodo_cierre`: el mecanismo de "fila
-- congelada, nunca se actualiza ni se borra" es idéntico para las dos,
-- solo cambia qué representan `desde`/`hasta`.
alter table public.guardia_periodo_cierre add column tipo text not null default 'global';

alter table public.guardia_periodo_cierre
  add constraint guardia_periodo_cierre_tipo_check
  check (tipo in ('semanal', 'global'));
