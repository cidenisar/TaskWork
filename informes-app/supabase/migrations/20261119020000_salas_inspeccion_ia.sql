-- ============================================================================
-- Inspección IA en Salas / Shelters / Containers (19/11/2026)
--
-- 1) salas.observaciones: texto libre con lo que se ve para reparar o mejorar y que no entra en
--    la lista de puntos de inspección. La IA lo propone al leer las fotos; quien releva lo revisa.
-- 2) Catálogo inicial de puntos de inspección para el módulo 'salas' (editable por un Admin en
--    Configuración → Catálogos → Inspección IA, igual que el de los otros módulos). Solo se
--    carga si el módulo todavía no tiene ninguno.
-- ============================================================================

alter table public.salas add column if not exists observaciones text;

insert into public.catalogo_inspeccion_ia (modulo, orden, texto)
select 'salas', v.orden, v.texto
from (values
  (1,  'Humedad, filtraciones o manchas de agua en paredes, techo o piso'),
  (2,  'Óxido o corrosión en la estructura, puerta, bisagras o gabinetes'),
  (3,  'Aire acondicionado: equipo faltante, con pérdidas, tapado, sucio o con el desagote mal resuelto'),
  (4,  'Cables sueltos, sin canalizar, colgando, empalmes expuestos o cableado desordenado'),
  (5,  'Pasacables, entradas de cañería o aberturas sin sellar (ingreso de agua, polvo, insectos o roedores)'),
  (6,  'Falta de orden y limpieza: objetos, cajas, residuos o materiales ajenos dentro de la sala'),
  (7,  'Extintor ausente, vencido o mal ubicado, y falta de señalización de seguridad'),
  (8,  'Iluminación insuficiente, luminarias rotas o sin luz de emergencia'),
  (9,  'Puerta, cerradura o burlete en mal estado (no cierra bien, sin llave o deformada)'),
  (10, 'Baterías hinchadas, con derrames o sulfatadas, o bancos de baterías en mal estado'),
  (11, 'Barra o cable de puesta a tierra faltante, desconectado o corroído'),
  (12, 'Piso, techo o paredes rotos, deformados o con revestimiento despegado'),
  (13, 'Equipos sin etiquetar o sin identificación en tableros, racks o cableado'),
  (14, 'Ventilación o refrigeración obstruida o insuficiente (rejillas tapadas, equipos sin espacio libre)'),
  (15, 'Nidos, restos de insectos, excrementos u otros signos de plagas'),
  (16, 'Tablero eléctrico abierto, sin tapa, con bornes expuestos o térmicas sin identificar')
) as v(orden, texto)
where not exists (select 1 from public.catalogo_inspeccion_ia where modulo = 'salas');
