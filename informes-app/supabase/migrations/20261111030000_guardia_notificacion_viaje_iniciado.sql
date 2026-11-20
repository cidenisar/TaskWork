-- Nuevo tipo de aviso: Riesgo de Viaje avisa a la guardia general cuando
-- alguien inicia un viaje (pedido de Ivan) — mismo mecanismo que los 4
-- disparadores de Guardia General ya existentes, solo un `tipo` más.
alter table public.guardia_notificacion drop constraint guardia_notificacion_tipo_check;

alter table public.guardia_notificacion
  add constraint guardia_notificacion_tipo_check
  check (tipo in ('activacion', 'cambio_pendiente', 'cambio_respondido', 'asuncion_semanal', 'viaje_iniciado'));
