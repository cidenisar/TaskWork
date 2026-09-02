-- ============================================================================
-- El catálogo de técnicos ahora se arma con los usuarios registrados
-- (Configuración → Usuarios y roles), no con altas manuales sueltas en
-- Catálogos. La torre asignada pasa a vivir en el profile de cada usuario
-- (mismo patrón FK que ya usaba catalogo_tecnicos.torre: referencia por
-- nombre a catalogo_torres, actualizable en cascada si se renombra una torre).
-- ============================================================================

alter table public.profiles
  add column torre text references public.catalogo_torres (nombre) on update cascade;
