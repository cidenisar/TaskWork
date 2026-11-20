-- Pronóstico real (texto legible) del día usado para evaluar el viaje — hasta
-- ahora solo quedaba el valor de punto del criterio C (1/2/4/5), sin el dato
-- de origen que lo explica. Se guarda al crear la evaluación (clima real del
-- destino para esa fecha), no se recalcula después.
alter table public.evaluaciones_riesgo_viaje add column clima_descripcion text;
