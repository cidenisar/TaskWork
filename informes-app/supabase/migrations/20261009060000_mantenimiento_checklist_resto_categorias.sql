-- Checklist de mantenimiento: contenido investigado para las categorías
-- que quedaron sin ítems en la primera entrega (20261009030000_
-- mantenimiento_checklist.sql solo cubrió las 6 más comunes). Mismo
-- criterio: ítems reales y específicos de cada tipo de equipo, no
-- genéricos — un Admin puede seguir agregando/quitando después sin tocar
-- código. "otro" queda afuera a propósito en los dos tipo_equipo: es un
-- cajón de sastre, no un tipo de equipo real sobre el que tenga sentido
-- escribir un checklist.
insert into public.mantenimiento_checklist_items (tipo_equipo, categoria, orden, texto) values
-- Racks: equipamiento de red/IT
('rack_equipamiento', 'router', 1, 'Backup de la configuración actualizado'),
('rack_equipamiento', 'router', 2, 'Versión de firmware/IOS al día'),
('rack_equipamiento', 'router', 3, 'Temperatura y estado de ventiladores'),
('rack_equipamiento', 'router', 4, 'Logs sin errores recurrentes'),
('rack_equipamiento', 'router', 5, 'Enlaces/puertos activos sin pérdida de paquetes'),
('rack_equipamiento', 'router', 6, 'Acceso de administración (SSH/web) funcionando'),

('rack_equipamiento', 'switch', 1, 'Backup de la configuración actualizado'),
('rack_equipamiento', 'switch', 2, 'Estado de puertos (errores, colisiones, down inesperados)'),
('rack_equipamiento', 'switch', 3, 'Alimentación PoE dentro de rango (si aplica)'),
('rack_equipamiento', 'switch', 4, 'Temperatura y estado de ventiladores'),
('rack_equipamiento', 'switch', 5, 'Redundancia de uplinks operativa'),
('rack_equipamiento', 'switch', 6, 'Etiquetado de cables prolijo y legible'),

('rack_equipamiento', 'servidor', 1, 'Estado del RAID / salud de discos'),
('rack_equipamiento', 'servidor', 2, 'Fuentes de alimentación redundantes OK'),
('rack_equipamiento', 'servidor', 3, 'Temperatura y estado de ventiladores'),
('rack_equipamiento', 'servidor', 4, 'Backups recientes verificados'),
('rack_equipamiento', 'servidor', 5, 'Firmware/BIOS al día'),
('rack_equipamiento', 'servidor', 6, 'Espacio en disco disponible dentro de lo esperado'),
('rack_equipamiento', 'servidor', 7, 'Logs de hardware sin alarmas activas'),

('rack_equipamiento', 'odf', 1, 'Conectores de fibra limpios (sin suciedad/grasa)'),
('rack_equipamiento', 'odf', 2, 'Radio de curvatura de las fibras sin forzar'),
('rack_equipamiento', 'odf', 3, 'Bandejas de empalme cerradas y fijas'),
('rack_equipamiento', 'odf', 4, 'Etiquetado de cada fibra correcto y legible'),
('rack_equipamiento', 'odf', 5, 'Atenuación medida dentro de rango esperado'),

('rack_equipamiento', 'patch_panel', 1, 'Conectores bien asentados (sin falsos contactos)'),
('rack_equipamiento', 'patch_panel', 2, 'Etiquetado de puertos correcto y legible'),
('rack_equipamiento', 'patch_panel', 3, 'Cables sin daños visibles ni forzados'),
('rack_equipamiento', 'patch_panel', 4, 'Organizadores de cable en buen estado'),

('rack_equipamiento', 'convertidor_medios', 1, 'LEDs de enlace/actividad encendidos correctamente'),
('rack_equipamiento', 'convertidor_medios', 2, 'Conector de fibra limpio'),
('rack_equipamiento', 'convertidor_medios', 3, 'Velocidad/dúplex configurado correctamente'),
('rack_equipamiento', 'convertidor_medios', 4, 'Alimentación estable (fuente/adaptador)'),

('rack_equipamiento', 'firewall', 1, 'Backup de reglas/configuración actualizado'),
('rack_equipamiento', 'firewall', 2, 'Firmware y firmas de seguridad al día'),
('rack_equipamiento', 'firewall', 3, 'Licencias/certificados sin vencer'),
('rack_equipamiento', 'firewall', 4, 'Logs revisados (intentos de intrusión, bloqueos anómalos)'),
('rack_equipamiento', 'firewall', 5, 'Failover/alta disponibilidad probado (si aplica)'),
('rack_equipamiento', 'firewall', 6, 'Temperatura y estado de ventiladores'),

('rack_equipamiento', 'multiplexor', 1, 'Niveles de señal óptica/eléctrica dentro de rango'),
('rack_equipamiento', 'multiplexor', 2, 'Alarmas activas en el equipo'),
('rack_equipamiento', 'multiplexor', 3, 'Conectores de fibra limpios'),
('rack_equipamiento', 'multiplexor', 4, 'Prueba de conmutación de protección (si tiene redundancia)'),

('rack_equipamiento', 'pdu_regleta', 1, 'Carga por salida dentro de la capacidad nominal'),
('rack_equipamiento', 'pdu_regleta', 2, 'Estado de térmicas/disyuntores'),
('rack_equipamiento', 'pdu_regleta', 3, 'Conexiones firmes, sin recalentamiento visible'),
('rack_equipamiento', 'pdu_regleta', 4, 'Etiquetado de cada salida correcto'),
('rack_equipamiento', 'pdu_regleta', 5, 'Indicador de protección contra sobretensión OK (si tiene)'),

-- Equipos individuales
('equipo_individual', 'control_acceso', 1, 'Lector/tarjeta responde correctamente'),
('equipo_individual', 'control_acceso', 2, 'Mecanismo de apertura (chapa/traba) funciona sin trabarse'),
('equipo_individual', 'control_acceso', 3, 'Batería de respaldo con carga suficiente'),
('equipo_individual', 'control_acceso', 4, 'Comunicación con el servidor/controladora activa'),
('equipo_individual', 'control_acceso', 5, 'Registro de eventos (log de accesos) sin huecos'),

('equipo_individual', 'impresora', 1, 'Calidad de impresión (prueba de página)'),
('equipo_individual', 'impresora', 2, 'Nivel de tóner/tinta suficiente'),
('equipo_individual', 'impresora', 3, 'Mecanismo de alimentación de papel sin atascos'),
('equipo_individual', 'impresora', 4, 'Limpieza de rodillos/cabezal'),
('equipo_individual', 'impresora', 5, 'Conectividad de red funcionando'),

('equipo_individual', 'telefonia', 1, 'Tono de línea / registro ante la central (IP-PBX)'),
('equipo_individual', 'telefonia', 2, 'Calidad de audio en llamada de prueba'),
('equipo_individual', 'telefonia', 3, 'Alimentación PoE o fuente externa estable'),
('equipo_individual', 'telefonia', 4, 'Firmware actualizado'),

('equipo_individual', 'climatizacion', 1, 'Temperatura real vs. setpoint configurado'),
('equipo_individual', 'climatizacion', 2, 'Filtros de aire limpios'),
('equipo_individual', 'climatizacion', 3, 'Nivel/presión de gas refrigerante'),
('equipo_individual', 'climatizacion', 4, 'Desagote de condensado sin obstrucciones'),
('equipo_individual', 'climatizacion', 5, 'Ruido anómalo en compresor/ventiladores'),
('equipo_individual', 'climatizacion', 6, 'Termostato calibrado correctamente');
