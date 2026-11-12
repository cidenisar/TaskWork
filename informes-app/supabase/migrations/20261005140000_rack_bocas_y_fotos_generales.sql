-- Dos ajustes al relevamiento de Racks:
--
-- 1) "Bocas disponibles": cuántos puertos libres tiene el equipo — un dato
-- que el técnico cuenta/sabe mirando el equipo, no algo que la IA pueda
-- inferir con confianza desde una foto (puede estar parcialmente tapado,
-- o no distinguirse qué puerto está realmente libre). Queda como campo
-- manual, igual criterio que posición (U) o etiqueta YPF: se completa al
-- dar de alta el equipo, no se vuelve a editar en visitas posteriores.
--
-- 2) La "foto general" del rack pasa de una sola a un array — mismo
-- criterio que `fotos_evidencia_urls` (entregas_deposito) y
-- `remito_fotos_urls` (informes_tecnicos): el técnico quiere sacar foto de
-- la parte delantera Y trasera del rack para más detalle.
--
-- NOTA: `drop column foto_general_url;` quedó afuera a propósito — el DROP
-- de columna viene colgándose repetidas veces vía las herramientas de
-- Supabase en esta sesión (ver notas en 20261005120000_informe_materiales.sql
-- y 20261005130000_remito_fotos_array.sql). La columna vieja queda huérfana
-- hasta poder correr el DROP a mano o cuando la herramienta ande:
-- `alter table public.rack_relevamientos drop column foto_general_url;`
alter table public.rack_equipamientos
  add column bocas_disponibles integer;

alter table public.rack_relevamientos
  add column fotos_generales_urls text[];
