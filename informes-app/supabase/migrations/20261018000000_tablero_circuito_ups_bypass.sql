-- Dos campos para que el dibujo del esquema unifilar respete las mismas
-- convenciones de AutoCAD que se usan a mano: distinguir "circuitos
-- normales" de "circuitos de UPS" (alimentados por la salida del UPS), y
-- marcar las 3 térmicas del bypass manual de un UPS (entrada UPS / bypass /
-- salida UPS -- se bajan entrada y salida y se sube el bypass para poder
-- sacar el UPS de servicio sin cortar los equipos aguas abajo).
alter table tablero_circuitos add column alimentado_por_ups boolean not null default false;
alter table tablero_circuitos add column rol_bypass_ups text
  check (rol_bypass_ups in ('entrada', 'bypass', 'salida'));
