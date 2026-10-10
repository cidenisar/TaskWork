-- Motivo de por qué se reprograma un mantenimiento a mano (ej. el técnico
-- llegó al sitio y no lo pudo hacer) — igual criterio que motivo_baja:
-- enum chico con "otro" de escape, nunca texto libre suelto. Null cuando
-- la programación es simplemente una fecha anticipada de antemano (no
-- hubo un intento fallido) o cuando la generó el algoritmo automático.
create type public.motivo_reprogramacion_mantenimiento as enum (
  'clima',
  'sitio_inaccesible',
  'falta_repuesto',
  'equipo_no_encontrado',
  'seguridad_sitio',
  'otro'
);

alter table public.mantenimiento_programaciones
  add column if not exists motivo public.motivo_reprogramacion_mantenimiento;
