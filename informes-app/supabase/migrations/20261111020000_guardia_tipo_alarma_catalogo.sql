-- "Tipo de alarma" pasa de 4 valores fijos (Grupo electrógeno/Router/UPS/
-- Otro) a un catálogo editable por categoría más general (Energía,
-- Comunicación, CCTV, Control de acceso...) — pedido de Ivan: que se
-- puedan agregar y sacar sin tocar código. `guardia_evento.tipo_alarma`
-- sigue siendo texto libre (nunca se le puso FK a propósito: un evento ya
-- registrado no tiene que romperse si más adelante se saca ese tipo del
-- catálogo) — esta tabla es solo la fuente del selector en pantalla.
alter table public.guardia_evento drop constraint guardia_evento_tipo_alarma_check;

create table public.guardia_tipo_alarma (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true,
  creado_por uuid references public.profiles(id),
  creado_at timestamptz not null default now()
);

alter table public.guardia_tipo_alarma enable row level security;

create policy "guardia_tipo_alarma_select" on public.guardia_tipo_alarma
  for select using ((select auth.uid()) is not null);
create policy "guardia_tipo_alarma_insert" on public.guardia_tipo_alarma
  for insert with check (public.is_admin_or_supervisor());
create policy "guardia_tipo_alarma_update" on public.guardia_tipo_alarma
  for update using (public.is_admin_or_supervisor());

insert into public.guardia_tipo_alarma (nombre) values ('Energía'), ('Comunicación'), ('CCTV'), ('Control de acceso');
