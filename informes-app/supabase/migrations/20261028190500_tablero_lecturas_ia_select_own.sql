-- El técnico que disparó la lectura necesita poder leerla de vuelta al
-- guardar la medición (para completar circuitos_revisados/porcentaje_acierto),
-- no solo Admin/Supervisor (que la ven para el listado de costos).
create policy tablero_lecturas_ia_select_own on public.tablero_lecturas_ia
  for select
  using (created_by = (select auth.uid()));
