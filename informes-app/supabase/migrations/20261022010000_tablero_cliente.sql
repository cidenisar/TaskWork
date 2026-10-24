-- Cliente del tablero (ej. "YPF") — hoy existe en Informe Técnico
-- (catalogo_clientes + alta al vuelo) pero Tableros nunca lo capturaba.
-- Hace falta para el rótulo del esquema unifilar (CLIENTE/CONTRATISTA/OBRA
-- del estándar de dibujo). Default 'YPF' porque es el cliente real de la
-- gran mayoría de los tableros ya cargados, no un valor inventado.
alter table public.tableros
  add column cliente text not null default 'YPF';
