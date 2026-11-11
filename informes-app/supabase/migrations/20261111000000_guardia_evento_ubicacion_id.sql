-- "Registrar llamada" (HANDOFF §5, paso 2) tenía el campo Sitio como texto
-- libre, distinto de cómo se elige la ubicación en el resto de la app
-- (Tableros, Racks, Informe Técnico, Materiales, ...) — pedido de Ivan
-- después de probar el circuito real: usar el mismo selector/catálogo de
-- Ubicaciones de siempre. `sitio` sigue siendo el texto que se muestra
-- (WhatsApp, historial, lista de eventos) — nada de lo que ya lee esa
-- columna se toca — pero ahora se arma desde la Ubicación elegida, y
-- `ubicacion_id` queda guardado como referencia real a esa fila.
alter table public.guardia_evento
  add column ubicacion_id uuid references public.ubicaciones(id);

drop function if exists public.guardia_crear_evento(text, text, text, text, text);

create or replace function public.guardia_crear_evento(
  p_tipo_alarma text,
  p_sitio text,
  p_descripcion text,
  p_ticket_tipo text,
  p_ticket_numero text,
  p_ubicacion_id uuid
)
returns public.guardia_evento
language plpgsql
security definer set search_path = public
as $$
declare
  v_numero integer;
  v_evento public.guardia_evento;
begin
  if not public.es_guardia_general() then
    raise exception 'Solo la guardia general puede registrar una llamada.';
  end if;

  update public.guardia_contador set valor = valor + 1 where id = 1 returning valor into v_numero;

  insert into public.guardia_evento (numero, tipo_alarma, sitio, descripcion, ticket_tipo, ticket_numero, ubicacion_id, creado_por)
  values (v_numero, p_tipo_alarma, p_sitio, p_descripcion, p_ticket_tipo, p_ticket_numero, p_ubicacion_id, auth.uid())
  returning * into v_evento;

  insert into public.guardia_participacion (evento_id, usuario_id, rol, modalidad, inicio_at, acepto_at)
  values (v_evento.id, auth.uid(), 'GUARDIA_GENERAL', 'REMOTO', v_evento.creado_at, v_evento.creado_at);

  insert into public.guardia_novedad (evento_id, texto, por)
  values (v_evento.id, 'Llamada de operación central: ' || p_descripcion, auth.uid());

  return v_evento;
end;
$$;

revoke all on function public.guardia_crear_evento(text, text, text, text, text, uuid) from public;
grant execute on function public.guardia_crear_evento(text, text, text, text, text, uuid) to authenticated;
