-- ============================================================================
-- Interruptores de IA (pedido de Ivan, 13/11/2026): elegir qué IAs usa la app
-- — Claude (paga) y las gratuitas (Cloudflare Workers AI, Groq, OpenRouter,
-- NVIDIA) — y cómo se combinan. Solo el Superusuario lo puede cambiar.
--
-- Singleton (mismo patrón que config_general). Los valores por defecto dejan
-- la app EXACTAMENTE como estaba: solo Claude prendido. Nada cambia hasta que
-- el Superusuario toque un interruptor.
--
-- Historial con valor anterior en tabla propia (el audit_log no guarda el
-- antes/después — regla del CLAUDE.md).
-- ============================================================================

create table public.config_ia (
  id integer primary key default 1 check (id = 1),
  claude_activo boolean not null default true,
  cloudflare_activo boolean not null default false,
  groq_activo boolean not null default false,
  openrouter_activo boolean not null default false,
  nvidia_activo boolean not null default false,
  -- combinada = votan todas las IAs prendidas y se toma la mayoría por campo;
  -- en_orden  = se usa la primera que responda (Claude → Cloudflare → Groq → OpenRouter → NVIDIA).
  modo text not null default 'combinada' check (modo in ('combinada', 'en_orden')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.config_ia (id) values (1);

create table public.config_ia_hist (
  id uuid primary key default gen_random_uuid(),
  campo text not null,
  valor_antes text,
  valor_despues text,
  quien uuid references public.profiles(id),
  cuando timestamptz not null default now()
);

create index config_ia_hist_cuando_idx on public.config_ia_hist (cuando desc);
create index config_ia_hist_quien_idx on public.config_ia_hist (quien);
create index config_ia_updated_by_idx on public.config_ia (updated_by);

alter table public.config_ia enable row level security;
alter table public.config_ia_hist enable row level security;

-- Cualquier usuario logueado la lee: las rutas de IA corren con la sesión del
-- técnico y necesitan saber qué IA usar.
create policy "config_ia_select" on public.config_ia
  for select using ((select auth.uid()) is not null);
create policy "config_ia_update_superusuario" on public.config_ia
  for update using (public.is_superusuario()) with check (public.is_superusuario());

create policy "config_ia_hist_select_superusuario" on public.config_ia_hist
  for select using (public.is_superusuario());
create policy "config_ia_hist_insert_superusuario" on public.config_ia_hist
  for insert with check (public.is_superusuario());
