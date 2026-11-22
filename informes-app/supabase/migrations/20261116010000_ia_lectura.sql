-- ============================================================================
-- Registro de lo que leyó cada IA (pedido de Ivan, 16/11/2026): con Claude
-- prendida hay una lectura de referencia; con las gratuitas solas hay que ver
-- QUÉ leyó cada una para compararlas y mejorar. Hasta ahora el enchufe
-- (lib/ai/motor.ts) votaba y descartaba lo que respondió cada IA.
--
-- Una fila por lectura de tipo JSON. NO guarda la foto (solo el JSON que
-- devolvió cada IA) — mismo criterio que ia_uso: poco volumen, sin imágenes.
-- user_id con "on delete set null": un registro de diagnóstico no debe
-- impedir borrar a un usuario (CRITERIOS §26).
-- ============================================================================

create table public.ia_lectura (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  endpoint text not null,
  modulo text not null,
  user_id uuid references public.profiles(id) on delete set null,
  modo text not null,
  -- IAs que respondieron bien (en orden de prioridad)
  proveedores text[] not null default '{}',
  -- una línea por IA que falló: "groq: HTTP 429 ..."
  fallaron jsonb not null default '[]'::jsonb,
  -- campos donde no hubo mayoría entre las IAs
  dudosos text[] not null default '{}',
  -- el JSON final que se le devolvió a la app
  resultado jsonb,
  -- { "claude": { "modelo": "...", "json": {...} }, "groq": {...} }
  por_ia jsonb not null default '{}'::jsonb
);

create index ia_lectura_created_idx on public.ia_lectura (created_at desc);
create index ia_lectura_endpoint_idx on public.ia_lectura (endpoint, created_at desc);
create index ia_lectura_user_idx on public.ia_lectura (user_id);

alter table public.ia_lectura enable row level security;

-- Las rutas de IA corren con la sesión del técnico: cada uno inserta SOLO lo suyo.
create policy "ia_lectura_insert_propia" on public.ia_lectura
  for insert with check (user_id = (select auth.uid()));
-- Verlas (pueden traer datos de tickets, CUIT, etc.) es solo del Superusuario.
create policy "ia_lectura_select_superusuario" on public.ia_lectura
  for select using (public.is_superusuario());
