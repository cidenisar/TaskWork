-- "Registrar llamada" (HANDOFF §5, paso 2) tenía el campo Sitio como texto
-- libre, distinto de cómo se elige la ubicación en el resto de la app
-- (Tableros, Racks, Informe Técnico, Materiales, ...) — pedido de Ivan
-- después de probar el circuito real: usar el mismo selector/catálogo de
-- Ubicaciones de siempre. `sitio` sigue siendo el texto que se muestra
-- (WhatsApp, historial, lista de eventos) — nada de lo que ya lee esa
-- columna se toca — pero ahora se arma desde la Ubicación elegida, y
-- `ubicacion_id` queda guardado como referencia real a esa fila.
--
-- Se guarda con un UPDATE aparte desde `crearEventoAction` (no cambiando
-- la firma de `guardia_crear_evento()`) para no depender de un DROP
-- FUNCTION — la herramienta de migraciones pide confirmación humana para
-- sentencias destructivas y esa confirmación no llegaba a aparecerle a
-- Ivan en esta sesión; el UPDATE lo permite la misma policy de
-- `guardia_evento_update` (quien crea el evento ya queda como su propia
-- guardia general en la misma transacción).
alter table public.guardia_evento
  add column ubicacion_id uuid references public.ubicaciones(id);
