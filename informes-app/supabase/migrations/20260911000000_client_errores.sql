-- ============================================================================
-- Reporte de errores del cliente — para ver en Configuración qué está
-- fallando en equipos que no podemos probar nosotros directamente (otro
-- celular, otro navegador) en vez de depender de que el usuario nos
-- describa el error de memoria.
--
-- Insert abierto a propósito (incluso sin sesión: un error en /login antes
-- de autenticarse también nos sirve para diagnosticar) — es autoreporte de
-- diagnóstico, no datos sensibles del negocio. Solo un Administrador puede
-- leerlos.
-- ============================================================================

create table public.client_errores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id),
  usuario_nombre text,
  usuario_email text,
  contexto text,
  mensaje text not null,
  stack text,
  url text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.client_errores enable row level security;

create policy "client_errores_insert_any" on public.client_errores for insert with check (true);
create policy "client_errores_select_admin" on public.client_errores for select using (public.is_admin());
