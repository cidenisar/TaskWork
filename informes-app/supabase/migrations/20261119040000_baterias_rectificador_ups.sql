-- Baterías: a qué alimenta cada banco (rectificador o UPS), cuántas baterías
-- lleva y de qué potencia es el rectificador/UPS — para saber CUÁNTAS baterías
-- hay que comprar cuando toca cambiarlas.
--
-- Los mismos campos viven en `equipos` (equipo suelto) y en
-- `rack_equipamientos` (componente de un rack), porque banco / UPS /
-- rectificador pueden estar de cualquiera de las dos formas.
--
--  - bateria_destino: solo en bancos — si sirve a un rectificador o a una UPS.
--  - bateria_cantidad: cantidad de baterías (monoblocks o elementos) del banco;
--    en una UPS, las baterías internas que lleva según su modelo.
--    Es POR UNIDAD: el total es cantidad × bateria_cantidad.
--  - bateria_origen: de dónde salió el número — contadas en la foto, deducidas
--    por el modelo (estimación), o cargadas a mano. Una estimación por modelo
--    nunca se presenta como una cuenta.
--  - bateria_tipo: tensión/capacidad de cada batería, texto libre ("12 V 150 Ah").
--  - ups_baterias: solo en UPS — si usa baterías internas o un banco externo.
--  - potencia_nominal: potencia del rectificador o la UPS tal como figura
--    ("10 kVA", "48 Vcc / 100 A"). Texto libre: cada fabricante la expresa distinto.
--  - alimentado_por_tipo / alimentado_por_id: vínculo del banco con el
--    rectificador/UPS al que pertenece. Referencia "blanda" (sin FK), igual
--    criterio que bajas_equipamiento.equipo_id; van juntos o ninguno.

alter table public.equipos
  add column bateria_destino text check (bateria_destino in ('rectificador', 'ups')),
  add column bateria_cantidad integer check (bateria_cantidad > 0),
  add column bateria_origen text check (bateria_origen in ('contadas', 'por_modelo', 'manual')),
  add column bateria_tipo text,
  add column ups_baterias text check (ups_baterias in ('internas', 'banco_externo')),
  add column potencia_nominal text,
  add column alimentado_por_tipo text check (alimentado_por_tipo in ('equipo_individual', 'rack_equipamiento')),
  add column alimentado_por_id uuid,
  add constraint equipos_alimentado_por_completo check ((alimentado_por_tipo is null) = (alimentado_por_id is null));

alter table public.rack_equipamientos
  add column bateria_destino text check (bateria_destino in ('rectificador', 'ups')),
  add column bateria_cantidad integer check (bateria_cantidad > 0),
  add column bateria_origen text check (bateria_origen in ('contadas', 'por_modelo', 'manual')),
  add column bateria_tipo text,
  add column ups_baterias text check (ups_baterias in ('internas', 'banco_externo')),
  add column potencia_nominal text,
  add column alimentado_por_tipo text check (alimentado_por_tipo in ('equipo_individual', 'rack_equipamiento')),
  add column alimentado_por_id uuid,
  add constraint rack_equipamientos_alimentado_por_completo check ((alimentado_por_tipo is null) = (alimentado_por_id is null));
