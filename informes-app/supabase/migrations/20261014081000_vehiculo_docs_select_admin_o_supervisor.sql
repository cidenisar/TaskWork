-- La Flota (Panel → Vehículos) es visible para Admin y Supervisor, pero el
-- bucket vehiculo-docs solo dejaba ver sus fotos a un Admin (única policy,
-- "for all" con is_admin()) — sin esto, un Supervisor no podía ver la
-- galería de fotos del alta aunque sí ve el resto de la ficha del vehículo.
-- Policy adicional de SOLO LECTURA (alta/baja/edición de estas fotos sigue
-- siendo exclusiva del Admin, vía la policy "for all" ya existente).
create policy "vehiculo_docs_select_admin_o_supervisor" on storage.objects
  for select using (bucket_id = 'vehiculo-docs' and public.is_admin_or_supervisor());
