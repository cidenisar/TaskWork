-- ============================================================================
-- Vehículos: las fotos de alta pasan de "guardar solo 1 por lote" a guardar
-- la galería completa (todas las fotos mandadas a leer con IA quedan como
-- evidencia visual, no solo la primera) — pedido real de uso: el técnico
-- quiere documentar visualmente el estado del vehículo (pintura, cubiertas,
-- ópticas, interior), no solo extraer un par de datos puntuales.
--
-- Se migran las fotos ya guardadas (una por columna vieja) al nuevo formato
-- array para no perder evidencia ya cargada, y se eliminan las columnas
-- viejas (nada más las leía — ver grep antes de migrar).
-- ============================================================================

alter table public.catalogo_vehiculos
  add column fotos_exterior_urls text[],
  add column fotos_interior_urls text[];

update public.catalogo_vehiculos
  set fotos_exterior_urls = array[foto_estado_alta_url]
  where foto_estado_alta_url is not null;

update public.catalogo_vehiculos
  set fotos_interior_urls = array[foto_tablero_url]
  where foto_tablero_url is not null;

-- `foto_estado_alta_url`/`foto_tablero_url` quedan sin uso desde acá (ya
-- migrados arriba) pero NO se borran en esta migración — un DROP COLUMN
-- requiere confirmación manual que esta sesión no pudo otorgarse a sí
-- misma. Es solo un par de columnas muertas e inofensivas; se pueden borrar
-- a mano más adelante (`alter table catalogo_vehiculos drop column
-- foto_estado_alta_url, drop column foto_tablero_url;`) sin apuro.

-- ============================================================================
-- Foto de perfil: hasta ahora solo el propio usuario podía subir la suya
-- (ver 20260902000008_profiles_perfil_personal.sql, policies "_own"). Pedido
-- real: que un Administrador también pueda cargarla/cambiarla por otro
-- usuario (ej. no tiene foto, o hay que corregirla) — igual criterio que
-- logo-empresa/vehiculo-docs: una policy ADICIONAL permisiva para Admin,
-- sin tocar las de autoedición que ya existen (se combinan con OR).
-- ============================================================================

create policy "fotos_perfil_admin_all" on storage.objects
  for all using (bucket_id = 'fotos-perfil' and public.is_admin())
  with check (bucket_id = 'fotos-perfil' and public.is_admin());
