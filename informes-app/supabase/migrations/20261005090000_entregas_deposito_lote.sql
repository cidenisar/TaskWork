-- "Nueva Entrega a Depósito" (material libre) pasa a soportar varios
-- materiales distintos en una sola carga (foto por foto, como Equipos
-- Individuales) con UN solo comprobante PDF para todos — así que varias
-- filas de entregas_deposito pueden compartir el mismo numero_generacion
-- (uno por "informe"/lote, no uno por material). Se relaja el UNIQUE a un
-- índice normal; la unicidad real pasa a chequearse en la aplicación
-- (SELECT antes de insertar, con reintento) en vez de en la constraint,
-- mismo criterio ya usado en el resolver de Ubicaciones (reintento ante
-- 23505 en vez de bloquear). El flujo de "equipo ya cargado en un sitio"
-- (una fila = una entrega, un número propio) no se toca.
alter table public.entregas_deposito drop constraint entregas_deposito_numero_generacion_key;
create index entregas_deposito_numero_generacion_idx on public.entregas_deposito (numero_generacion);
