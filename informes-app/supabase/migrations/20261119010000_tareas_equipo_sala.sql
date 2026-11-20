-- ============================================================================
-- Tareas pendientes: una tarea también se puede vincular a una Sala / Shelter /
-- Container (los tres entran al Plan de Mantenimiento como tipo "sala"). Se
-- agrega 'sala' a los tipos de equipo permitidos en tareas_pendientes.equipo_tipo.
-- (Las salas no se "dan de baja" como el resto del equipamiento, así que el
-- cierre automático por baja no aplica a ellas: se cierran a mano desde el Panel.)
-- ============================================================================

alter table public.tareas_pendientes drop constraint tareas_pendientes_equipo_tipo_check;
alter table public.tareas_pendientes add constraint tareas_pendientes_equipo_tipo_check
  check (equipo_tipo in ('tablero_circuito', 'rack_equipamiento', 'equipo_individual', 'sala'));
