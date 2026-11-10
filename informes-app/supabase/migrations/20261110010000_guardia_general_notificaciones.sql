-- ============================================================================
-- Guardia General — Fase 5: notificaciones (HANDOFF-guardia-general.md §9).
--
-- "push_subscriptions" es infraestructura GENERAL (no específica de
-- Guardia): la suscripción Web Push de un navegador es un dato del
-- usuario, no de un módulo — así cualquier otro módulo de esta app que en
-- el futuro necesite avisar algo reusa esta misma tabla en vez de crear
-- la suya. "guardia_notificacion" sí es propia del módulo: cada fila es
-- un aviso de un tipo de Guardia General puntual (activación, cambio
-- pendiente, etc.).
--
-- `ref_id` es `text`, no `uuid`: algunos tipos de aviso referencian una
-- fila sin id propio (ej. `guardia_asuncion`, PK compuesta
-- `semana_inicio+area`, sin columna `id`) — texto sirve para cualquier
-- referencia, uuid solo para algunas.
--
-- Inserts/updates de `guardia_notificacion` son SIEMPRE server-side con
-- el cliente de service-role (`notificar()` en `src/lib/guardia/push.ts`):
-- a propósito sin policy de INSERT/UPDATE para `authenticated` — quien
-- dispara un aviso (la guardia general activando a otro, un técnico
-- respondiendo un cambio, el cron semanal) no necesariamente es oficina,
-- así que una policy por rol tendría que cubrir demasiados casos; service
-- role ya corre dentro de un server action que YA verificó el permiso de
-- la acción real (activar, crear cambio, responder), así que no hace
-- falta duplicar esa verificación acá.
-- ============================================================================

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_usuario_idx on public.push_subscriptions (usuario_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select" on public.push_subscriptions
  for select using (usuario_id = (select auth.uid()));
create policy "push_subscriptions_insert" on public.push_subscriptions
  for insert with check (usuario_id = (select auth.uid()));
create policy "push_subscriptions_delete" on public.push_subscriptions
  for delete using (usuario_id = (select auth.uid()));

create table public.guardia_notificacion (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in ('activacion', 'cambio_pendiente', 'cambio_respondido', 'asuncion_semanal')),
  ref_tipo text not null,
  ref_id text not null,
  canal text not null default 'push',
  payload jsonb not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviada', 'entregada', 'leida', 'fallida')),
  intentos integer not null default 0,
  error text,
  creada_at timestamptz not null default now(),
  enviada_at timestamptz,
  entregada_at timestamptz,
  leida_at timestamptz,
  unique (tipo, ref_tipo, ref_id, usuario_id, canal)
);
create index guardia_notificacion_usuario_idx on public.guardia_notificacion (usuario_id);
create index guardia_notificacion_estado_idx on public.guardia_notificacion (estado);

alter table public.guardia_notificacion enable row level security;

-- Oficina ve el estado de cada aviso (HANDOFF §9: "mostrar en la oficina
-- el estado de cada aviso, para ver si un técnico no recibió su «Te
-- activaron»"). Cada uno también puede ver los propios (para que la
-- pantalla que marca "leída" al abrir la notificación pueda confirmar
-- que es su fila antes de pedir el cambio).
create policy "guardia_notificacion_select" on public.guardia_notificacion
  for select using (usuario_id = (select auth.uid()) or public.is_admin_or_supervisor());

-- El dueño puede marcar sus propias notificaciones como entregadas/leídas
-- (lo hace el service worker con la sesión del navegador, no service
-- role) — nunca puede tocar ningún otro campo relevante porque el server
-- action que llama esto solo manda `estado` y los timestamps calculados.
create policy "guardia_notificacion_marcar" on public.guardia_notificacion
  for update using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));
