-- Librería de símbolos de motor-unifilares (ver motor-unifilares/README.md,
-- "Librería de símbolos") — geometría EXACTA extraída de bloques DXF reales
-- (AutoCAD del usuario), no interpretada por la IA. Reemplaza el enfoque
-- anterior (geometría hardcodeada en src/simbolos/termica.ts y disyuntor.ts,
-- que se eliminan en este mismo cambio) para que la librería pueda crecer
-- sin necesitar un deploy de código cada vez: se actualiza corriendo el
-- importador de DXF (pantalla web, ver public/simbolos.html).
create table public.motor_unifilares_simbolos (
  nombre text primary key,
  descripcion text not null default '',
  commands jsonb not null,
  ancho numeric not null,
  alto numeric not null,
  actualizado_en timestamptz not null default now()
);

alter table public.motor_unifilares_simbolos enable row level security;
-- Sin políticas a propósito (mismo criterio que motor_unifilares_ejemplos):
-- esta tabla la usa únicamente motor-unifilares con la service role key,
-- nunca el cliente (anon/authenticated) de informes-app.

comment on table public.motor_unifilares_simbolos is
  'Librería de símbolos reusables de motor-unifilares — geometría exacta (DrawCommand[], anclada con centro horizontal y borde superior en (0,0)) extraída de bloques DXF reales, no dibujada por la IA en cada circuito. Se carga/actualiza desde la pantalla web de importación DXF (public/simbolos.html → POST /api/simbolos). Sin RLS abierto a propósito.';

-- Seed: los dos símbolos que ya existían hardcodeados en código
-- (src/simbolos/termica.ts y disyuntor.ts), geometría extraída 1:1 del
-- primer plano real ya validado por el usuario — se migran a esta tabla
-- para que convivan con los que se vayan importando desde DXF real.
insert into public.motor_unifilares_simbolos (nombre, descripcion, commands, ancho, alto) values
  (
    'termica',
    'Térmica — contacto IEC vertical con cuchilla inclinada (ver REGLAS_UNIFILAR.md, A5).',
    '[
      {"type":"rect","x":-4,"y":0,"width":8,"height":18,"layer":"SIMBOLOS"},
      {"type":"line","x1":-2,"y1":2,"x2":2,"y2":16,"layer":"SIMBOLOS"}
    ]'::jsonb,
    8, 18
  ),
  (
    'disyuntor',
    'Disyuntor — térmica con óvalo de toroide (ver REGLAS_UNIFILAR.md, A5).',
    '[
      {"type":"rect","x":-4,"y":0,"width":8,"height":18,"layer":"SIMBOLOS"},
      {"type":"ellipse","x":0,"y":9,"rx":7,"ry":4,"layer":"SIMBOLOS"}
    ]'::jsonb,
    14, 18
  );
