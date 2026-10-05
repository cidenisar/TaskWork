-- Fotos de evidencia (vista general del material, 1-2) para Entregas a
-- Depósito — distintas de las fotos que se usan para identificar con IA
-- (esas se procesan y se descartan, nunca se guardan). Estas quedan
-- guardadas en storage y se imprimen en el PDF del comprobante, para tener
-- una vista de lo que efectivamente se entregó.
--
-- Igual criterio que numero_generacion/pdf_url: todas las filas de un mismo
-- lote (misma carga, varios materiales) comparten el mismo array acá.
alter table public.entregas_deposito
  add column fotos_evidencia_urls text[];
