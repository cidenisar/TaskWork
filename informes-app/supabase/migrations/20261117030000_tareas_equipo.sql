-- ============================================================================
-- Tareas pendientes, etapa 3 (17/11/2026): una tarea puede apuntar a un equipo
-- concreto del sitio (un circuito de tablero, un equipo de rack o un equipo
-- suelto). Si ese equipo se da de baja, la tarea se cierra sola (ver
-- src/lib/tareas/cerrar-por-baja.ts).
--
-- Referencia "blanda" (tipo + id, sin foreign key): el equipo vive en tres
-- tablas distintas y los registros de baja ya usan el mismo esquema
-- (bajas_equipamiento.tipo_equipo / equipo_id). Ambos campos van juntos o ninguno.
-- ============================================================================

alter table public.tareas_pendientes
  add column equipo_tipo text
    check (equipo_tipo in ('tablero_circuito', 'rack_equipamiento', 'equipo_individual')),
  add column equipo_id uuid,
  add constraint tareas_pendientes_equipo_completo check ((equipo_tipo is null) = (equipo_id is null));

-- Solo las abiertas importan para "¿qué tareas tiene este equipo?" al darlo de baja.
create index tareas_pendientes_equipo_idx on public.tareas_pendientes (equipo_tipo, equipo_id) where estado = 'abierta';
