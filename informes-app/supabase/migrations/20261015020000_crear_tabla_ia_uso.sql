-- Registro de consumo real de tokens de IA por llamada, para poder ver el gasto
-- estimado por módulo/día en vez de solo adivinarlo. Cualquier usuario logueado
-- dispara estas llamadas (técnicos cargando fotos), pero el panel de costo es
-- solo para Admin/Supervisor.
create table public.ia_uso (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null,
  modulo text not null,
  modelo text not null,
  input_tokens integer not null,
  output_tokens integer not null,
  costo_estimado_usd numeric(10,4) not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.ia_uso enable row level security;

create policy ia_uso_insert on public.ia_uso
  for insert
  with check ((select auth.uid()) is not null);

create policy ia_uso_select_admin_supervisor on public.ia_uso
  for select
  using (is_admin_or_supervisor());

create index ia_uso_created_at_idx on public.ia_uso (created_at desc);
