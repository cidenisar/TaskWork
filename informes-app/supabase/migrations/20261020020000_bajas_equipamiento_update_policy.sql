-- bajas_equipamiento tenía SELECT/INSERT pero nunca UPDATE: hacía falta
-- para poder confirmar la entrega física a depósito (entregado_deposito_at/
-- entregado_deposito_por, ver migración anterior) sin pasar por Service
-- Role — mismo criterio que entregas_deposito_update.
create policy bajas_equipamiento_update on public.bajas_equipamiento
  for update
  using (public.is_admin_or_supervisor());
