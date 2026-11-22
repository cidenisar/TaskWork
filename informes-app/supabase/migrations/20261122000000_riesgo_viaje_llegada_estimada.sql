-- Riesgo de Viaje: hora estimada de llegada, para poder avisar (alarma en Vista General y en el Panel) cuando un
-- viaje en curso se pasa de su horario y nadie marcó que llegó. Opcional: las evaluaciones anteriores no la tienen
-- (para esas se usa un tope de horas desde que salieron).

alter table public.evaluaciones_riesgo_viaje
  add column llegada_estimada_at timestamptz;
