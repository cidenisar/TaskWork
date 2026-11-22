-- Cuerpo físico del tablero (ej. "Cuerpo 1", "Puerta exterior izquierda") al
-- que pertenece un circuito/elemento — un tablero puede tener varios cuerpos
-- (gabinetes/puertas) con contenido y fechas de visita distintas, y esto es
-- independiente de la jerarquía principal/secundario (que son tableros
-- físicamente separados, no compartimentos del mismo gabinete).
alter table tablero_circuitos add column cuerpo text;
