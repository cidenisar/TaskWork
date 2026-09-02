-- ============================================================================
-- "Mi cuenta": datos personales que cada usuario carga sobre sí mismo
-- (teléfono, foto de perfil) — para uso futuro (identificación en informes,
-- contacto rápido, etc.). rol y torre siguen siendo exclusivos del Admin.
-- ============================================================================

alter table public.profiles
  add column telefono text,
  add column foto_perfil_url text;

-- Bucket público (se muestra "en chiquito" en toda la app sin pedir URL
-- firmada, igual que logo-empresa) con carpeta por usuario {uid}/...
insert into storage.buckets (id, name, public)
values ('fotos-perfil', 'fotos-perfil', true)
on conflict (id) do nothing;

create policy "fotos_perfil_public_select" on storage.objects
  for select using (bucket_id = 'fotos-perfil');
create policy "fotos_perfil_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'fotos-perfil' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "fotos_perfil_update_own" on storage.objects
  for update using (
    bucket_id = 'fotos-perfil' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "fotos_perfil_delete_own" on storage.objects
  for delete using (
    bucket_id = 'fotos-perfil' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Cada usuario puede actualizar SU PROPIA fila de profiles (antes solo podía
-- el Admin) — necesario para que carguen teléfono/foto ellos mismos. Un
-- trigger evita que, aun con esta policy abierta, alguien se autopromueva de
-- rol o se cambie la torre/email vía una llamada directa a la API (esas
-- columnas quedan exclusivas de un Administrador; el resto — nombre,
-- teléfono, foto — sí se puede autoeditar).
create function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.rol is distinct from old.rol then
      raise exception 'Solo un Administrador puede cambiar el rol.';
    end if;
    if new.torre is distinct from old.torre then
      raise exception 'Solo un Administrador puede cambiar la torre asignada.';
    end if;
    if new.email is distinct from old.email then
      raise exception 'No podés cambiar tu email desde acá.';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_profile_privileged_fields_trigger
  before update on public.profiles
  for each row execute procedure public.protect_profile_privileged_fields();

create policy "profiles_update_own" on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));
