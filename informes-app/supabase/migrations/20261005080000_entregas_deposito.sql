-- Entregas a Depósito: equipo/material que vuelve al depósito (nuevo sin
-- usar, o usado pero funcional) — distinto de una Baja (que es roto/
-- obsoleto/retirado para siempre). Dos orígenes posibles: un equipo que ya
-- estaba cargado en un sitio (tablero_circuito/rack_equipamiento/
-- equipo_individual — mismo tipo_equipo_baja que usa Bajas, reusado a
-- propósito en vez de duplicar el enum) o material nunca registrado como
-- equipamiento de un sitio (cables, repuestos, equipo nuevo sin instalar).

create type public.origen_entrega_deposito as enum ('equipo_existente', 'material_libre');
create type public.condicion_material as enum ('nuevo', 'usado_funcional');
create type public.motivo_entrega_deposito as enum ('sobrante_obra', 'reemplazo_funcional', 'retorno_mantenimiento', 'otro');

-- 'en_deposito': el equipo ya no está físicamente en el sitio (volvió al
-- depósito) pero tampoco es una Baja — podría volver a instalarse en otro
-- lado. Mismo criterio de "estado" que ya usa Bajas, un valor más.
alter table public.tablero_circuitos drop constraint tablero_circuitos_estado_check;
alter table public.tablero_circuitos add constraint tablero_circuitos_estado_check
  check (estado in ('activo', 'baja', 'en_deposito'));

alter table public.rack_equipamientos drop constraint rack_equipamientos_estado_check;
alter table public.rack_equipamientos add constraint rack_equipamientos_estado_check
  check (estado in ('activo', 'baja', 'en_deposito'));

alter table public.equipos drop constraint equipos_estado_check;
alter table public.equipos add constraint equipos_estado_check
  check (estado in ('activo', 'baja', 'en_deposito'));

create table public.entregas_deposito (
  id uuid primary key default gen_random_uuid(),
  numero_generacion text not null unique,
  origen public.origen_entrega_deposito not null,
  -- tipo_equipo/equipo_id solo se completan cuando origen = 'equipo_existente'
  tipo_equipo public.tipo_equipo_baja,
  equipo_id uuid,
  descripcion text not null,
  categoria text,
  marca_modelo text,
  numero_serie text,
  etiqueta_ypf text,
  cantidad integer not null default 1,
  condicion public.condicion_material not null,
  motivo public.motivo_entrega_deposito not null,
  comentario text,
  ubicacion_id uuid not null references public.ubicaciones(id),
  fecha date not null,
  created_by uuid not null references public.profiles(id),
  pdf_url text,
  pdf_generado_at timestamptz,
  created_at timestamptz not null default now()
);

create index entregas_deposito_ubicacion_id_idx on public.entregas_deposito(ubicacion_id);
create index entregas_deposito_fecha_idx on public.entregas_deposito(fecha desc);

alter table public.entregas_deposito enable row level security;

create policy "entregas_deposito_select" on public.entregas_deposito
  for select using (public.is_admin_or_supervisor());
create policy "entregas_deposito_insert" on public.entregas_deposito
  for insert with check (public.is_admin_or_supervisor());
-- La acción de "material libre" no usa Service Role (no toca ninguna tabla
-- de equipamiento admin-only), así que necesita poder actualizar
-- pdf_url/pdf_generado_at después de subir el PDF con su propia sesión.
create policy "entregas_deposito_update" on public.entregas_deposito
  for update using (public.is_admin_or_supervisor());
