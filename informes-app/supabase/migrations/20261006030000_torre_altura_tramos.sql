-- Altura ESTIMADA de una torre de comunicaciones, a partir del tipo de
-- torre + conteo de tramos (secciones modulares) visibles en las fotos del
-- relevamiento, en vez de intentar medirla por fotogrametría con una sola
-- foto (sin referencia de escala, no es confiable). La IA clasifica el
-- tipo y cuenta tramos; el LARGO real de cada tramo sale de un catálogo
-- configurado acá, nunca del "conocimiento general" de la IA (puede variar
-- por fabricante/modelo) — mismo principio que el clima del Panel: dato
-- real/configurado, la IA interpreta la foto, no inventa el dato externo.
create type public.torre_tipo as enum ('autosoportada', 'arriostrada', 'monopole', 'otro');

alter table public.torres_comunicacion
  add column if not exists tipo_torre public.torre_tipo,
  add column if not exists tramos_contados integer,
  add column if not exists altura_estimada_m numeric;

-- Catálogo de largo de tramo (en metros) por tipo de torre — "otro" queda
-- deliberadamente afuera (no configurable: si no se pudo clasificar el
-- tipo, tampoco hay un largo de tramo estándar que aplicar). Solo un Admin
-- lo edita, lectura abierta (el formulario de relevamiento lo necesita).
create table public.torre_tipo_largos (
  tipo_torre public.torre_tipo primary key,
  largo_tramo_m numeric not null check (largo_tramo_m > 0),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

alter table public.torre_tipo_largos enable row level security;
create policy "torre_tipo_largos_select" on public.torre_tipo_largos for select using ((select auth.uid()) is not null);
create policy "torre_tipo_largos_admin_insert" on public.torre_tipo_largos for insert with check (public.is_admin());
create policy "torre_tipo_largos_admin_update" on public.torre_tipo_largos for update using (public.is_admin());
create policy "torre_tipo_largos_admin_delete" on public.torre_tipo_largos for delete using (public.is_admin());
