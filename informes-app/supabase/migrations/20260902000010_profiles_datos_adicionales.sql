-- ============================================================================
-- "Mis datos" ampliado: documentación personal, contacto de emergencia y
-- talla de indumentaria — autocargados por cada usuario (no privilegiados,
-- protect_profile_privileged_fields_trigger solo protege rol/torre/email).
-- Todo nullable: nada de esto es obligatorio para usar la app hoy.
-- ============================================================================

alter table public.profiles
  add column dni text,
  add column dni_vencimiento date,
  add column fecha_nacimiento date,
  add column factor_sanguineo text,
  add column licencia_conducir_vencimiento date,
  add column email_alternativo text,
  add column contacto_emergencia_nombre text,
  add column contacto_emergencia_telefono text,
  add column talla_camisa text,
  add column talla_pantalon text,
  add column talla_remera text,
  add column talla_campera text,
  add column talla_mameluco text,
  add column talla_botines text;
