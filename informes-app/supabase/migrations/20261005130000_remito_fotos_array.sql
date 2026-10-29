-- El remito puede traer varias fotos (varias páginas, o un reintento de
-- una que salió borrosa) — se pasa de una sola foto (`remito_foto_url`) a
-- un array, mismo criterio que `fotos_evidencia_urls` de entregas_deposito.
--
-- NOTA: `drop column remito_foto_url;` quedó afuera a propósito — el DROP
-- (de tabla o de columna) viene colgándose repetidas veces vía las
-- herramientas de Supabase en esta sesión (ver nota en
-- 20261005120000_informe_materiales.sql), mientras que ADD/ALTER sin DROP
-- anduvieron bien. La columna vieja queda huérfana (nunca tuvo datos
-- reales — se agregó y se dejó de usar en la misma sesión) hasta poder
-- correr el DROP a mano o cuando la herramienta ande:
-- `alter table public.informes_tecnicos drop column remito_foto_url;`
alter table public.informes_tecnicos
  add column remito_fotos_urls text[];
