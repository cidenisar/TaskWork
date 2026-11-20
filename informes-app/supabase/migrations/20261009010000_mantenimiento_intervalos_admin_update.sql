-- Faltaba la policy de UPDATE en mantenimiento_intervalos: la tabla de
-- configuración pasa de "agregar/quitar" a una tabla editable en el lugar
-- (upsert por tipo_equipo+categoria) — sin esto, el ON CONFLICT DO UPDATE
-- del upsert afecta 0 filas en silencio (mismo tipo de bug ya documentado
-- en CRITERIOS_Y_IDEAS.md con Torres).
create policy "mantenimiento_intervalos_admin_update" on public.mantenimiento_intervalos for update using (public.is_admin());
