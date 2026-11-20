-- ============================================================================
-- Amplía is_admin()/is_admin_or_supervisor() para incluir 'superusuario' (así
-- todas las policies RLS que ya se basan en estas dos funciones lo alcanzan
-- automáticamente, sin tocar cada policy una por una), y agrega
-- is_superusuario() como el gate exclusivo para las acciones más
-- irreversibles. Ver 20261106000000_rol_superusuario_enum.sql.
-- ============================================================================

create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and rol in ('admin', 'superusuario')
  );
$$;

create or replace function public.is_admin_or_supervisor()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and rol in ('admin', 'supervisor', 'superusuario')
  );
$$;

create function public.is_superusuario()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and rol = 'superusuario'
  );
$$;
