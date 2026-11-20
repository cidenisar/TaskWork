-- ============================================================================
-- Tareas pendientes, etapa 2 (17/11/2026): al hacer un informe en un sitio, el
-- técnico ve los pendientes de ESE sitio y tilda los que resolvió en la visita.
-- Quedan cerradas con motivo "resuelta_en_visita", ligadas al informe donde se
-- resolvieron (informe_cierre_id) y figuran en su PDF.
--
-- El técnico no puede cerrar tareas por RLS (eso es de la oficina). Esta
-- función es la única puerta: cierra SOLO tareas abiertas del MISMO sitio del
-- informe, que no nacieron en ese mismo informe, y solo si quien llama es el
-- dueño del informe (o la oficina). Quién cerró queda en cerrada_por.
-- ============================================================================

alter table public.tareas_pendientes
  add column informe_cierre_id uuid references public.informes_tecnicos(id) on delete set null;

create index tareas_pendientes_informe_cierre_idx on public.tareas_pendientes (informe_cierre_id);

-- Columnas de salida con nombre propio (tarea_id / tarea_texto) y todo calificado con
-- el alias "t": un nombre suelto como "id" o "texto" se resolvería contra la variable
-- de salida y no contra la columna (CRITERIOS_Y_IDEAS §3).
create or replace function public.resolver_tareas_en_visita(p_informe_id uuid, p_tarea_ids uuid[])
returns table (tarea_id uuid, tarea_texto text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_ubicacion uuid;
begin
  if not (public.es_dueno_del_informe(p_informe_id) or public.is_admin_or_supervisor()) then
    raise exception 'No podés resolver tareas en un informe que no es tuyo.';
  end if;

  select i.ubicacion_id into v_ubicacion from public.informes_tecnicos i where i.id = p_informe_id;
  if v_ubicacion is null then
    return;
  end if;

  return query
    update public.tareas_pendientes t
       set estado = 'resuelta',
           motivo_cierre = 'resuelta_en_visita',
           cerrada_at = now(),
           cerrada_por = auth.uid(),
           informe_cierre_id = p_informe_id
     where t.id = any (p_tarea_ids)
       and t.estado = 'abierta'
       and t.ubicacion_id = v_ubicacion
       and t.informe_id is distinct from p_informe_id
    returning t.id, t.texto;
end;
$$;

-- Solo usuarios logueados (no anónimos).
revoke execute on function public.resolver_tareas_en_visita(uuid, uuid[]) from public;
grant execute on function public.resolver_tareas_en_visita(uuid, uuid[]) to authenticated;
