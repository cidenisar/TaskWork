-- ============================================================================
-- Tableros: subsistemas mixtos + categoría de equipamiento por circuito.
--
-- En la práctica, un tablero físico no es siempre "de un solo tipo" — puede
-- tener térmicas de energía, una fuente/UPS de CCTV y una lectora de control
-- de acceso conviviendo en el mismo gabinete. `tableros.tipo` (un solo valor)
-- se reemplaza por `subsistemas` (array): qué subsistemas están presentes en
-- ese tablero, pudiendo marcar más de uno.
--
-- Además, cada circuito/elemento ahora tiene su propia "categoría de
-- equipamiento" (térmica, disyuntor, bornera, fuente industrial, UPS
-- industrial, batería, conversor DC, inyector PoE, descargador gaseoso,
-- cámara, lectora, cerradura, etc.) y su "tipo de circuito" (220V
-- monofásico / 380V trifásico / 24V DC / 12V DC / no aplica) — así se puede
-- armar un resumen de cuántos circuitos de cada tensión y cuánto
-- equipamiento de cada categoría hay relevado, tanto en pantalla como en el
-- PDF. Reemplaza el gate anterior "pideCorrientePorFase(tipo, tipoEvento)"
-- (a nivel tablero) por uno a nivel de cada circuito, ya que en un tablero
-- mixto solo las térmicas/disyuntores miden corriente, no todo el tablero.
-- ============================================================================

create type public.tablero_categoria_equipo as enum (
  'termica',
  'disyuntor',
  'bornera',
  'bornera_fusible',
  'fuente_industrial',
  'ups_industrial',
  'bateria',
  'conversor_dc',
  'inyector_poe',
  'descargador_gaseoso',
  'camara',
  'lectora',
  'cerradura',
  'otro'
);

create type public.tablero_tipo_circuito as enum ('220v_mono', '380v_tri', '24vdc', '12vdc', 'na');

alter table public.tablero_circuitos
  add column categoria_equipo public.tablero_categoria_equipo not null default 'otro',
  add column tipo_circuito public.tablero_tipo_circuito not null default 'na';

-- Backfill de circuitos existentes: heurística razonable a partir del tipo
-- que tenía su tablero (no hay categoría real para inferir retroactivamente,
-- pero deja los datos de prueba ya cargados en un estado sensato en vez de
-- todos en "otro"/"na").
update public.tablero_circuitos c
set
  categoria_equipo = (case t.tipo
    when 'energia' then 'termica'
    when 'cctv' then 'camara'
    when 'control_acceso' then 'lectora'
  end)::public.tablero_categoria_equipo,
  tipo_circuito = (case when t.tipo = 'energia' then '220v_mono' else 'na' end)::public.tablero_tipo_circuito
from public.tableros t
where t.id = c.tablero_id;

alter table public.tableros add column subsistemas public.tablero_tipo[] not null default '{}';
update public.tableros set subsistemas = array[tipo]::public.tablero_tipo[];
alter table public.tableros add constraint tableros_subsistemas_not_empty check (subsistemas <> '{}'::public.tablero_tipo[]);
alter table public.tableros drop column tipo;
