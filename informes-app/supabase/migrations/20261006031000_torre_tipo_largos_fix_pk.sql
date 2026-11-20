-- Fix: torre_tipo_largos había quedado con tipo_torre como primary key
-- directa — rompe el helper genérico `eliminarRegistroConArchivos`
-- (lib/admin/eliminar-registro.ts), que asume que TODA tabla tiene una
-- columna `id` (uuid) como PK, igual criterio que el resto de catálogos
-- de esta app (ej. mantenimiento_intervalos: id uuid PK + unique
-- (tipo_equipo, categoria)). Mismo patrón acá: id uuid PK + unique
-- (tipo_torre). Sin datos reales cargados todavía (recién creada en esta
-- misma sesión), así que no hace falta migrar filas existentes.
alter table public.torre_tipo_largos drop constraint torre_tipo_largos_pkey;
alter table public.torre_tipo_largos add column id uuid primary key default gen_random_uuid();
alter table public.torre_tipo_largos add constraint torre_tipo_largos_tipo_torre_key unique (tipo_torre);
