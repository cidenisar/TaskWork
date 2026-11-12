-- La "foto general" del tablero pasa de una sola a un array — mismo
-- criterio que `fotos_generales_urls` (rack_relevamientos),
-- `fotos_evidencia_urls` (entregas_deposito) y `remito_fotos_urls`
-- (informes_tecnicos): con varios cuerpos, una sola foto del conjunto no
-- alcanza para dejar constancia de cada cuerpo del tablero.
--
-- NOTA: `drop column foto_general_url;` queda afuera a propósito — el DROP
-- de columna se cuelga repetidas veces vía las herramientas de Supabase en
-- esta sesión (ver notas en otras migraciones de fotos_..._urls). La
-- columna vieja queda huérfana hasta poder correr el DROP a mano o cuando
-- la herramienta ande: `alter table public.tablero_mediciones drop column foto_general_url;`
alter table public.tablero_mediciones
  add column fotos_generales_urls text[];
