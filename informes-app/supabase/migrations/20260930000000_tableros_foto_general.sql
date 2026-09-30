-- ============================================================================
-- Tableros: foto general del tablero por visita.
--
-- Una toma general del tablero (aparte de las fotos que se mandan a la IA
-- para leer circuitos) que queda guardada como registro y se imprime en el
-- PDF de esa medición/relevamiento — igual criterio que informe_imagenes,
-- reutiliza el bucket informe-fotos ya existente (path
-- {userId}/tableros/{medicionId}/general.jpg), no hace falta storage nuevo.
-- ============================================================================

alter table public.tablero_mediciones add column foto_general_url text;
