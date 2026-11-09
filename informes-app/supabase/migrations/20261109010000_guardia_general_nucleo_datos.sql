-- ============================================================================
-- Guardia General — Fase 2: modelo de datos + RLS (HANDOFF-guardia-general.md
-- §11, con las decisiones ya confirmadas por Ivan el 9/11/2026: cerrar
-- período y editar parámetros = admin + supervisor, igual que el resto de
-- "oficina"; numeración de eventos correlativa sin huecos.
--
-- "guardia_config" sigue el mismo patrón ya usado en esta app para
-- parámetros de negocio (singleton tipo config_general), no una tabla
-- clave/valor genérica — reutilizando la convención que ya existe en vez de
-- inventar una nueva (regla del CLAUDE.md de la raíz).
--
-- Deliberadamente NO incluye todavía: guardia_notificacion (outbox, recién
-- hace falta en la Fase 5 de notificaciones) ni las Server Actions de
-- cronograma/cambios/asunción/parámetros/feriados/período (se arman junto
-- con sus pantallas en la Fase 3, no en abstracto). Esta migración sí es
-- la base completa de datos para esas fases.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- guardia_persona — quién hace qué guardia (extiende profiles, no lo altera).
-- Las tablas van ANTES de los helpers de más abajo: una función
-- `language sql` se parsea contra los objetos reales al crearla (a
-- diferencia de `plpgsql`), así que necesita que la tabla ya exista.
-- ---------------------------------------------------------------------------
create table public.guardia_persona (
  usuario_id uuid primary key references public.profiles(id) on delete cascade,
  area text not null check (area in ('General', 'Infraestructura', 'Datos', 'Enlaces')),
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.guardia_persona_hist (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id),
  area_antes text,
  area_despues text,
  quien uuid references public.profiles(id),
  cuando timestamptz not null default now()
);

-- Helpers (SECURITY DEFINER para no generar recursión de RLS al mirar el
-- área de guardia de alguien desde la policy de otra tabla).
create or replace function public.guardia_area_de(p_usuario_id uuid)
returns text
language sql
stable
security definer set search_path = public
as $$
  select area from public.guardia_persona where usuario_id = p_usuario_id;
$$;

create or replace function public.es_guardia_general()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.guardia_area_de(auth.uid()) = 'General';
$$;

alter table public.guardia_persona enable row level security;
alter table public.guardia_persona_hist enable row level security;

create policy "guardia_persona_select" on public.guardia_persona
  for select using ((select auth.uid()) is not null);
create policy "guardia_persona_oficina_all" on public.guardia_persona
  for all using (public.is_admin_or_supervisor()) with check (public.is_admin_or_supervisor());
create policy "guardia_persona_hist_select" on public.guardia_persona_hist
  for select using (public.is_admin_or_supervisor());
create policy "guardia_persona_hist_insert" on public.guardia_persona_hist
  for insert with check (public.is_admin_or_supervisor());

-- ---------------------------------------------------------------------------
-- guardia_config — parámetros del negocio, singleton (HANDOFF §6 y §8).
-- Valores default = los que confirmó Ivan (sección 6 y 7.1 del HANDOFF).
-- ---------------------------------------------------------------------------
create table public.guardia_config (
  id integer primary key default 1 check (id = 1),
  entrada_min integer not null default 450, -- 07:30
  salida_activacion_min integer not null default 1020, -- 17:00
  madrugada_hasta_min integer not null default 450, -- 07:30
  tope_media_min integer not null default 270, -- 4:30
  valor_media integer not null default 50, -- 0,5 (centésimas)
  valor_entera integer not null default 100, -- 1,0 (centésimas)
  cambio_min integer not null default 600, -- 10:00, miércoles
  periodo_desde date not null default date_trunc('month', now())::date,
  periodo_hasta date not null default (date_trunc('month', now()) + interval '1 month - 1 day')::date,
  updated_at timestamptz not null default now()
);
insert into public.guardia_config (id) values (1);

create table public.guardia_config_hist (
  id uuid primary key default gen_random_uuid(),
  campo text not null,
  antes text,
  despues text,
  quien uuid references public.profiles(id),
  cuando timestamptz not null default now()
);

alter table public.guardia_config enable row level security;
alter table public.guardia_config_hist enable row level security;

create policy "guardia_config_select" on public.guardia_config
  for select using ((select auth.uid()) is not null);
create policy "guardia_config_update" on public.guardia_config
  for update using (public.is_admin_or_supervisor()) with check (public.is_admin_or_supervisor());
create policy "guardia_config_hist_select" on public.guardia_config_hist
  for select using (public.is_admin_or_supervisor());
create policy "guardia_config_hist_insert" on public.guardia_config_hist
  for insert with check (public.is_admin_or_supervisor());

-- ---------------------------------------------------------------------------
-- guardia_feriado — solo los MARCADOS afectan el cálculo (HANDOFF §10).
-- ---------------------------------------------------------------------------
create table public.guardia_feriado (
  fecha date primary key,
  nombre text not null,
  origen text not null check (origen in ('NACIONAL', 'MANUAL')),
  marcado_por uuid references public.profiles(id),
  marcado_at timestamptz not null default now()
);

create table public.guardia_feriado_hist (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  accion text not null check (accion in ('marcado', 'desmarcado')),
  quien uuid references public.profiles(id),
  cuando timestamptz not null default now()
);

alter table public.guardia_feriado enable row level security;
alter table public.guardia_feriado_hist enable row level security;

create policy "guardia_feriado_select" on public.guardia_feriado
  for select using ((select auth.uid()) is not null);
-- Lo marca/quita la guardia general (cualquier día, no solo "hoy" — esa
-- restricción es de la pantalla del celu, no de la base) o la oficina.
create policy "guardia_feriado_insert" on public.guardia_feriado
  for insert with check (public.es_guardia_general() or public.is_admin_or_supervisor());
create policy "guardia_feriado_delete" on public.guardia_feriado
  for delete using (public.es_guardia_general() or public.is_admin_or_supervisor());
create policy "guardia_feriado_hist_select" on public.guardia_feriado_hist
  for select using (public.is_admin_or_supervisor());
create policy "guardia_feriado_hist_insert" on public.guardia_feriado_hist
  for insert with check (public.es_guardia_general() or public.is_admin_or_supervisor());

-- ---------------------------------------------------------------------------
-- guardia_cronograma_semana — generar/editar/regenerar es siempre oficina
-- (HANDOFF §7.3/§7.4) — la lectura es abierta (guardiaDe() y el celu la
-- necesitan para cualquier rol).
-- ---------------------------------------------------------------------------
create table public.guardia_cronograma_semana (
  semana_inicio date not null,
  area text not null check (area in ('General', 'Infraestructura', 'Datos', 'Enlaces')),
  usuario_id uuid references public.profiles(id),
  primary key (semana_inicio, area)
);

create table public.guardia_cronograma_hist (
  id uuid primary key default gen_random_uuid(),
  semana_inicio date not null,
  area text not null,
  antes uuid,
  despues uuid,
  motivo text not null,
  quien uuid references public.profiles(id),
  cuando timestamptz not null default now()
);

alter table public.guardia_cronograma_semana enable row level security;
alter table public.guardia_cronograma_hist enable row level security;

create policy "guardia_cronograma_select" on public.guardia_cronograma_semana
  for select using ((select auth.uid()) is not null);
create policy "guardia_cronograma_oficina_all" on public.guardia_cronograma_semana
  for all using (public.is_admin_or_supervisor()) with check (public.is_admin_or_supervisor());
create policy "guardia_cronograma_hist_select" on public.guardia_cronograma_hist
  for select using (public.is_admin_or_supervisor());
create policy "guardia_cronograma_hist_insert" on public.guardia_cronograma_hist
  for insert with check (public.is_admin_or_supervisor());

-- ---------------------------------------------------------------------------
-- guardia_cambio — cambio de guardia / intercambio (HANDOFF §7.5). Quién
-- puede REGISTRAR uno queda abierto (§16.2) — por ahora solo oficina;
-- ampliar esto a autoservicio del técnico es decisión pendiente, no
-- tomada acá. Quien tiene que cubrir SÍ puede responder su propia fila
-- pendiente (Asumo / No puedo) sin ser oficina.
-- ---------------------------------------------------------------------------
create table public.guardia_cambio (
  id uuid primary key default gen_random_uuid(),
  par_id uuid not null default gen_random_uuid(),
  tipo text not null check (tipo in ('CUBRE', 'DEVUELVE')),
  area text not null check (area in ('General', 'Infraestructura', 'Datos', 'Enlaces')),
  persona_id uuid not null references public.profiles(id),
  original_id uuid not null references public.profiles(id),
  desde date not null,
  hasta date not null check (hasta >= desde),
  motivo text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptado', 'rechazado', 'anulado')),
  registrado_por uuid not null references public.profiles(id),
  registrado_at timestamptz not null default now(),
  respondido_at timestamptz
);
create index guardia_cambio_area_estado_idx on public.guardia_cambio (area, estado);

alter table public.guardia_cambio enable row level security;

create policy "guardia_cambio_select" on public.guardia_cambio
  for select using ((select auth.uid()) is not null);
create policy "guardia_cambio_insert" on public.guardia_cambio
  for insert with check (public.is_admin_or_supervisor());
-- Oficina corrige/anula cualquier cosa; quien tiene que cubrir responde SOLO
-- su propia fila mientras esté pendiente (el server action nunca manda otro
-- valor que "aceptado"/"rechazado" desde ese camino).
create policy "guardia_cambio_update" on public.guardia_cambio
  for update using (
    public.is_admin_or_supervisor()
    or (persona_id = (select auth.uid()) and estado = 'pendiente')
  );

-- ---------------------------------------------------------------------------
-- guardia_asuncion — "Asumo la guardia" semanal (HANDOFF §7.6). La fila
-- "pendiente" la crea el sistema (cron, Fase 5) con el cliente de
-- service-role — por eso acá no hay policy de INSERT para `authenticated`.
-- ---------------------------------------------------------------------------
create table public.guardia_asuncion (
  semana_inicio date not null,
  area text not null check (area in ('General', 'Infraestructura', 'Datos', 'Enlaces')),
  usuario_id uuid not null references public.profiles(id),
  asumio_at timestamptz,
  primary key (semana_inicio, area)
);

alter table public.guardia_asuncion enable row level security;

create policy "guardia_asuncion_select" on public.guardia_asuncion
  for select using ((select auth.uid()) is not null);
create policy "guardia_asuncion_asumir" on public.guardia_asuncion
  for update using (usuario_id = (select auth.uid()) and asumio_at is null);
create policy "guardia_asuncion_oficina_update" on public.guardia_asuncion
  for update using (public.is_admin_or_supervisor());

-- ---------------------------------------------------------------------------
-- guardia_contador — el "tabla-contador dentro de la transacción" que pide
-- el HANDOFF para la numeración correlativa sin huecos (§11, §16.11,
-- confirmado por Ivan). A propósito SIN NINGUNA policy: ningún cliente lo
-- toca directo, solo la función guardia_crear_evento() (SECURITY DEFINER)
-- de más abajo, dentro de la misma transacción que crea el evento.
-- ---------------------------------------------------------------------------
create table public.guardia_contador (
  id integer primary key default 1 check (id = 1),
  valor integer not null default 0
);
insert into public.guardia_contador (id, valor) values (1, 0);
alter table public.guardia_contador enable row level security;

-- ---------------------------------------------------------------------------
-- guardia_evento / guardia_participacion / guardia_novedad / guardia_correccion
-- — el circuito del evento (HANDOFF §5). `version` = bloqueo optimista en
-- las dos primeras. `idempotencia_key` en participación y novedad: un
-- pedido repetido por mala señal (mismo id generado por el dispositivo) no
-- duplica la fila, la UNIQUE lo rechaza y el server action lo trata como
-- "ya se hizo" en vez de como error.
-- ---------------------------------------------------------------------------
create table public.guardia_evento (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique,
  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  origen text not null default 'LLAMADA' check (origen in ('LLAMADA', 'MAIL')),
  tipo_alarma text not null check (tipo_alarma in ('Grupo electrógeno', 'Router', 'UPS', 'Otro')),
  sitio text not null,
  descripcion text not null,
  ticket_tipo text not null check (ticket_tipo in ('Incidencia', 'Ticket', 'Tarea de cambio')),
  ticket_numero text,
  scada text check (scada in ('SIN_NOVEDAD', 'CON_NOVEDAD')),
  creado_por uuid not null references public.profiles(id),
  creado_at timestamptz not null default now(),
  cerrado_at timestamptz,
  version integer not null default 1
);

create table public.guardia_participacion (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.guardia_evento(id) on delete cascade,
  usuario_id uuid not null references public.profiles(id),
  rol text not null check (rol in ('GUARDIA_GENERAL', 'INFRAESTRUCTURA', 'DATOS', 'ENLACES')),
  modalidad text check (modalidad in ('REMOTO', 'CAMPO')),
  pedido text check (pedido in ('REVISAR', 'ASISTIR')),
  inicio_at timestamptz not null,
  acepto_at timestamptz,
  fin_at timestamptz,
  estado text not null default 'en_curso' check (estado in ('en_curso', 'terminada', 'no_contesto')),
  idempotencia_key uuid unique,
  version integer not null default 1
);
create index guardia_participacion_evento_idx on public.guardia_participacion (evento_id);
create index guardia_participacion_usuario_idx on public.guardia_participacion (usuario_id);

create table public.guardia_novedad (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.guardia_evento(id) on delete cascade,
  at timestamptz not null default now(),
  texto text not null,
  por uuid references public.profiles(id), -- null = sistema
  idempotencia_key uuid unique
);
create index guardia_novedad_evento_idx on public.guardia_novedad (evento_id);

create table public.guardia_correccion (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.guardia_evento(id) on delete cascade,
  participacion_id uuid references public.guardia_participacion(id),
  campo text not null,
  antes text,
  despues text,
  por uuid not null references public.profiles(id),
  at timestamptz not null default now()
);

alter table public.guardia_evento enable row level security;
alter table public.guardia_participacion enable row level security;
alter table public.guardia_novedad enable row level security;
alter table public.guardia_correccion enable row level security;

-- guardia_evento: técnico ve lo que creó o en lo que participó; oficina ve todo.
-- INSERT a propósito SIN policy: solo entra por guardia_crear_evento().
create policy "guardia_evento_select" on public.guardia_evento
  for select using (
    creado_por = (select auth.uid())
    or exists (select 1 from public.guardia_participacion p where p.evento_id = id and p.usuario_id = (select auth.uid()))
    or public.is_admin_or_supervisor()
  );
create policy "guardia_evento_update" on public.guardia_evento
  for update using (
    public.is_admin_or_supervisor()
    or exists (
      select 1 from public.guardia_participacion p
      where p.evento_id = id and p.usuario_id = (select auth.uid()) and p.rol = 'GUARDIA_GENERAL'
    )
  );

-- guardia_participacion: tu propia fila, o cualquier fila de un evento donde
-- VOS sos la guardia general (para ver/activar/cerrar a los demás), o toda
-- si sos oficina.
create policy "guardia_participacion_select" on public.guardia_participacion
  for select using (
    usuario_id = (select auth.uid())
    or exists (
      select 1 from public.guardia_participacion gg
      where gg.evento_id = evento_id and gg.usuario_id = (select auth.uid()) and gg.rol = 'GUARDIA_GENERAL'
    )
    or public.is_admin_or_supervisor()
  );
create policy "guardia_participacion_insert" on public.guardia_participacion
  for insert with check (
    public.is_admin_or_supervisor()
    or exists (
      select 1 from public.guardia_participacion gg
      where gg.evento_id = evento_id and gg.usuario_id = (select auth.uid()) and gg.rol = 'GUARDIA_GENERAL'
    )
  );
create policy "guardia_participacion_update" on public.guardia_participacion
  for update using (
    usuario_id = (select auth.uid())
    or exists (
      select 1 from public.guardia_participacion gg
      where gg.evento_id = evento_id and gg.usuario_id = (select auth.uid()) and gg.rol = 'GUARDIA_GENERAL'
    )
    or public.is_admin_or_supervisor()
  );

-- guardia_novedad: cualquier participante del evento (incluida la guardia
-- general) la lee y la escribe; oficina también.
create policy "guardia_novedad_select" on public.guardia_novedad
  for select using (
    exists (select 1 from public.guardia_participacion p where p.evento_id = evento_id and p.usuario_id = (select auth.uid()))
    or public.is_admin_or_supervisor()
  );
create policy "guardia_novedad_insert" on public.guardia_novedad
  for insert with check (
    exists (select 1 from public.guardia_participacion p where p.evento_id = evento_id and p.usuario_id = (select auth.uid()))
    or public.is_admin_or_supervisor()
  );

-- guardia_correccion: solo oficina (es su propio rastro de auditoría).
create policy "guardia_correccion_select" on public.guardia_correccion
  for select using (public.is_admin_or_supervisor());
create policy "guardia_correccion_insert" on public.guardia_correccion
  for insert with check (public.is_admin_or_supervisor());

-- ---------------------------------------------------------------------------
-- guardia_periodo_cierre — inmutable a propósito: nunca UPDATE ni DELETE.
-- ---------------------------------------------------------------------------
create table public.guardia_periodo_cierre (
  id uuid primary key default gen_random_uuid(),
  desde date not null,
  hasta date not null check (hasta >= desde),
  cerrado_at timestamptz not null default now(),
  cerrado_por uuid not null references public.profiles(id),
  parametros_json jsonb not null,
  resultado_json jsonb not null
);

alter table public.guardia_periodo_cierre enable row level security;

create policy "guardia_periodo_cierre_select" on public.guardia_periodo_cierre
  for select using (public.is_admin_or_supervisor());
create policy "guardia_periodo_cierre_insert" on public.guardia_periodo_cierre
  for insert with check (public.is_admin_or_supervisor());

-- ---------------------------------------------------------------------------
-- guardia_crear_evento — única puerta de entrada para registrar una
-- llamada (HANDOFF §5 paso 2): valida que quien llama es guardia general,
-- incrementa el contador y crea evento + participación propia + novedad,
-- todo en la misma transacción — así un numero nunca queda "suelto" si algo
-- de esto falla.
-- ---------------------------------------------------------------------------
create or replace function public.guardia_crear_evento(
  p_tipo_alarma text,
  p_sitio text,
  p_descripcion text,
  p_ticket_tipo text,
  p_ticket_numero text
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

  insert into public.guardia_evento (numero, tipo_alarma, sitio, descripcion, ticket_tipo, ticket_numero, creado_por)
  values (v_numero, p_tipo_alarma, p_sitio, p_descripcion, p_ticket_tipo, p_ticket_numero, auth.uid())
  returning * into v_evento;

  insert into public.guardia_participacion (evento_id, usuario_id, rol, modalidad, inicio_at, acepto_at)
  values (v_evento.id, auth.uid(), 'GUARDIA_GENERAL', 'REMOTO', v_evento.creado_at, v_evento.creado_at);

  insert into public.guardia_novedad (evento_id, texto, por)
  values (v_evento.id, 'Llamada de operación central: ' || p_descripcion, auth.uid());

  return v_evento;
end;
$$;

revoke all on function public.guardia_crear_evento(text, text, text, text, text) from public;
grant execute on function public.guardia_crear_evento(text, text, text, text, text) to authenticated;
