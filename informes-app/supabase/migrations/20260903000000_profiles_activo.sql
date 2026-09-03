-- ============================================================================
-- Desactivar usuarios en vez de borrarlos.
--
-- Un borrado real de la fila en auth.users (y su profile, en cascada) choca
-- contra las FK de informes_tecnicos.created_by / rendiciones_gastos.created_by
-- / audit_log.actor_id (sin "on delete cascade" a propósito, para que el
-- historial sea permanente — spec sección 6.5) en cuanto ese usuario ya haya
-- generado un informe o una rendición, que es el caso normal. En vez de eso:
-- un Administrador "desactiva" la cuenta (bloquea el login, ver src/lib/auth.ts
-- y src/app/login/actions.ts) sin tocar ningún dato histórico.
-- ============================================================================

alter table public.profiles add column activo boolean not null default true;

comment on column public.profiles.activo is
  'false = cuenta desactivada por un Administrador: no puede iniciar sesión, pero su historial de informes/rendiciones se conserva intacto.';
