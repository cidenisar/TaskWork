-- Nombre de la empresa (contratista) junto al logo ya existente en
-- Configuración → Datos de la Empresa. Hoy esa pantalla solo guarda la
-- imagen (logo_empresa_url) — el nombre en texto hace falta para el rótulo
-- del esquema unifilar de Tableros (y cualquier otro lugar que necesite el
-- nombre, no solo la imagen). Default "SONDA" (la contratista real, no un
-- valor inventado).
alter table public.config_general
  add column nombre_empresa text not null default 'SONDA';
