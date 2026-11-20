-- Fase 3 de lectura-fotos (docs/lectura-fotos/ENCARGO.md, repo
-- cidenisar/motor-unifilar rama lectura-fotos): guarda cada lectura
-- "detallada" de tablero (fotos + JSON crudo + JSON revisado + uso) para
-- poder listar costo por tablero/mes y medir qué % de los campos que
-- propuso la IA el técnico no tuvo que tocar. Se inserta al momento de la
-- llamada a la IA (tablero_id/medicion_id todavía pueden no existir si el
-- técnico está dando de alta un tablero nuevo) y se completa al guardar la
-- medición.
create table public.tablero_lecturas_ia (
  id uuid primary key default gen_random_uuid(),
  tablero_id uuid references public.tableros(id) on delete set null,
  medicion_id uuid references public.tablero_mediciones(id) on delete set null,
  fotos_urls text[] not null default '{}',
  modelo text not null,
  input_tokens integer not null,
  output_tokens integer not null,
  costo_estimado_usd numeric(10,4) not null,
  json_crudo jsonb not null,
  circuitos_adaptados jsonb not null,
  circuitos_revisados jsonb,
  porcentaje_acierto numeric(5,2),
  created_by uuid not null references public.profiles(id),
  revisor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.tablero_lecturas_ia enable row level security;

create policy tablero_lecturas_ia_insert on public.tablero_lecturas_ia
  for insert
  with check ((select auth.uid()) is not null);

-- El mismo técnico que disparó la lectura es quien la completa al guardar
-- la medición (tablero_id/medicion_id/circuitos_revisados/porcentaje_acierto/revisor_id).
create policy tablero_lecturas_ia_update_own on public.tablero_lecturas_ia
  for update
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy tablero_lecturas_ia_select_admin_supervisor on public.tablero_lecturas_ia
  for select
  using (is_admin_or_supervisor());

create index tablero_lecturas_ia_created_at_idx on public.tablero_lecturas_ia (created_at desc);
create index tablero_lecturas_ia_tablero_id_idx on public.tablero_lecturas_ia (tablero_id);
