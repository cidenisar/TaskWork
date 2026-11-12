-- El origen (ubicación de donde salió el equipo antes de darlo de baja) ya
-- se guarda y se muestra desde que existe bajas_equipamiento (ubicacion_id,
-- visible en el Historial de Bajas y en el PDF del comprobante). Lo que
-- faltaba: dar de baja un equipo y entregarlo físicamente a depósito no
-- siempre pasan en el mismo momento (puede quedar unos días en el sitio
-- esperando el próximo viaje) — estas dos columnas permiten confirmar, más
-- tarde, que la entrega física ya se hizo, sin duplicar el registro ni
-- tocar el estado del equipo (que ya quedó en 'baja' desde el alta).
alter table public.bajas_equipamiento
  add column entregado_deposito_at timestamptz,
  add column entregado_deposito_por uuid references public.profiles(id);
