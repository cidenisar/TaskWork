-- Un técnico puede hacer DOS guardias (su sector + la Guardia General que
-- coordina los sectores) — pedido de Ivan, 12/11. Hasta ahora `guardia_persona`
-- tenía PK(usuario_id): una sola área por persona, a propósito (HANDOFF
-- original). Pasa a PK(usuario_id, area): una fila por área que esa persona
-- cubre, ninguna fila = "sin guardia" en esa área. El motor de rotación
-- (cronograma.ts: listaArea/generarProgramacion/regenerarDesde) ya filtra
-- todo por área, así que no necesita ningún cambio — una persona con dos
-- filas simplemente aparece en las dos listas de rotación, cada una
-- independiente.
alter table public.guardia_persona drop constraint guardia_persona_pkey;
alter table public.guardia_persona add primary key (usuario_id, area);

-- Con varias filas por usuario, un select sin limit podía devolver más de
-- una fila donde se esperaba un escalar — acá nunca se armó ORDER BY/LIMIT
-- porque antes NO PODÍA haber más de una. Se deja determinística (no es
-- la única guardia de esa persona, pero no se usa para nada que necesite
-- "todas", solo quedó como helper legado).
create or replace function public.guardia_area_de(p_usuario_id uuid)
returns text
language sql
stable
security definer set search_path = public
as $$
  select area from public.guardia_persona where usuario_id = p_usuario_id order by area limit 1;
$$;

-- Antes dependía de guardia_area_de() = 'General', que con dos filas podía
-- devolver la OTRA área y dar falso negativo. Ahora pregunta directamente
-- "¿tiene una fila de General?", sin importar cuántas otras áreas tenga.
create or replace function public.es_guardia_general()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from public.guardia_persona where usuario_id = auth.uid() and area = 'General');
$$;
