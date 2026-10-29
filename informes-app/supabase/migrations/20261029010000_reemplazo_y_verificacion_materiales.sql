-- ============================================================================
-- Tres inconsistencias reales del circuito de materiales/equipos, detectadas
-- en conversación con el usuario (ver CRITERIOS_Y_IDEAS.md):
--
-- 1. Un componente de rack (switch/UPS/banco de baterías) cargado desde la
--    sección "Materiales" de Informe Técnico quedaba SIEMPRE como equipo
--    suelto en `equipos`, sin ningún vínculo al rack real — si ese mismo
--    componente también se cargaba bien, vía un relevamiento de rack,
--    quedaba duplicado en dos tablas sin relación. `informe_materiales`
--    gana un destino alternativo (`rack_equipamiento_id`) para cuando el
--    técnico marca que el material va dentro de un rack ya registrado.
--
-- 2. No había ningún concepto de "reemplazo": dar de baja el equipo viejo
--    era un trámite manual y posterior, de otro rol (Admin/Supervisor), sin
--    ningún vínculo al equipo nuevo que lo reemplazó. `equipos` y
--    `rack_equipamientos` ganan `reemplaza_equipo_id`/`reemplaza_tipo`
--    (mismo patrón de referencia "blanda" sin FK que ya usa
--    `bajas_equipamiento.equipo_id` — el id puede apuntar a cualquiera de
--    las 3 tablas de equipamiento) para que el alta del nuevo pueda
--    disparar, en el mismo paso, la baja automática del viejo.
--
-- 3. Nuevo motivo de baja 'reemplazo' — hasta ahora solo existían
--    rotura/ampliación/obsolescencia/otro.
--
-- 4. Verificación de instalación contra fotos (IA): si un ítem de
--    materiales/remito queda marcado "no se ve instalado" en las fotos de
--    evidencia, el técnico puede sacarle una foto puntual de respaldo —
--    columna `foto_confirmacion_url` en ambas tablas.
-- ============================================================================

alter type public.motivo_baja add value 'reemplazo';

alter table public.equipos
  add column reemplaza_equipo_id uuid,
  add column reemplaza_tipo public.tipo_equipo_baja;

alter table public.rack_equipamientos
  add column reemplaza_equipo_id uuid,
  add column reemplaza_tipo public.tipo_equipo_baja;

alter table public.informe_materiales
  add column rack_equipamiento_id uuid references public.rack_equipamientos(id),
  add column foto_confirmacion_url text;

alter table public.informe_remito_items
  add column foto_confirmacion_url text;
