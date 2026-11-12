-- ============================================================================
-- Inspección IA — extiende la generalización (ver
-- 20261014050000_inspeccion_ia_generica.sql) a los 2 módulos que habían
-- quedado afuera a propósito en la primera vuelta: Vehículos (alta con
-- fotos) e Informe Técnico (lectura de remito). Pedido explícito del
-- usuario para sumarlos también. Solo hace falta extender el RLS insert de
-- `inspeccion_ia_hallazgos` — `modulo` ya es texto libre, sin check
-- constraint, así que el catálogo acepta estos módulos sin tocar schema.
--
-- `vehiculos`: a diferencia de los otros módulos, `catalogo_vehiculos` no
-- tiene `created_by` (el alta con fotos es Admin-only, `requireAdmin()` en
-- `altaVehiculoConFotosAction`) — el chequeo de dueño no aplica, se valida
-- directo con `is_admin()`.
-- `informe_tecnico`: mismo patrón que los demás módulos (`informes_
-- tecnicos.created_by`).
-- ============================================================================

alter policy "inspeccion_ia_hallazgos_insert" on public.inspeccion_ia_hallazgos
  with check (
    case modulo
      when 'tableros' then exists (
        select 1 from public.tablero_mediciones m where m.id = registro_id and m.created_by = (select auth.uid())
      )
      when 'racks' then exists (
        select 1 from public.rack_relevamientos m where m.id = registro_id and m.created_by = (select auth.uid())
      )
      when 'equipos' then exists (
        select 1 from public.equipo_relevamientos m where m.id = registro_id and m.created_by = (select auth.uid())
      )
      when 'torres' then exists (
        select 1 from public.torre_comunicacion_relevamientos m where m.id = registro_id and m.created_by = (select auth.uid())
      )
      when 'vehiculos' then public.is_admin()
      when 'informe_tecnico' then exists (
        select 1 from public.informes_tecnicos m where m.id = registro_id and m.created_by = (select auth.uid())
      )
      else false
    end
  );
