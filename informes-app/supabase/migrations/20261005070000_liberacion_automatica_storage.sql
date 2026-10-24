-- Liberación automática de PDFs viejos del storage "caliente", con backup
-- antes de borrar (nunca se pierde el archivo, solo se mueve) — opt-in,
-- apagado por default: respeta el criterio original de la spec ("nunca se
-- borra nada automáticamente"), pero ahora existe el mecanismo para quien
-- quiera activarlo. El registro en la tabla de origen nunca se toca más
-- que para vaciar pdf_url — el dato queda para siempre (spec 6.5).
alter table config_general
  add column if not exists liberacion_automatica_activa boolean not null default false;

insert into storage.buckets (id, name, public)
values ('informes-pdf-archivo', 'informes-pdf-archivo', false)
on conflict (id) do nothing;

-- Solo lectura de Admin, para una futura pantalla de "recuperar" — el job
-- en sí usa la Service Role Key y bypassea RLS, así que esto no lo bloquea.
create policy "informes_pdf_archivo_select_admin" on storage.objects
  for select using (bucket_id = 'informes-pdf-archivo' and public.is_admin());
