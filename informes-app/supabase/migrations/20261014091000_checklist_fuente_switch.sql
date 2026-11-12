-- Checklist de mantenimiento para las dos categorías nuevas de Equipos
-- Individuales (fuente/rectificador y switch) — mismo criterio que el resto:
-- contenido inicial investigado, un Admin lo ajusta después sin tocar código.
insert into public.mantenimiento_checklist_items (tipo_equipo, categoria, orden, texto) values
('equipo_individual', 'fuente', 1, 'Tensión de salida dentro de rango'),
('equipo_individual', 'fuente', 2, 'Corriente de carga'),
('equipo_individual', 'fuente', 3, 'Alarmas activas en el display'),
('equipo_individual', 'fuente', 4, 'Ventilación/filtros limpios'),
('equipo_individual', 'fuente', 5, 'Ajuste de bornes y conexiones'),
('equipo_individual', 'switch', 1, 'LEDs de enlace/actividad de los puertos en orden'),
('equipo_individual', 'switch', 2, 'Temperatura y ventilación del equipo'),
('equipo_individual', 'switch', 3, 'Cableado prolijo y etiquetado'),
('equipo_individual', 'switch', 4, 'Firmware/configuración respaldada'),
('equipo_individual', 'switch', 5, 'Alimentación (fuente/PoE) sin alarmas');
