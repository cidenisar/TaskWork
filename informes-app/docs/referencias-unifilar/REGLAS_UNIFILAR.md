# Reglas de dibujo de tableros – estándar TerraLogic (v2)

Planos de referencia:
- **TSBT CCTV-CCAA Ingreso TLC** – Unifilar 220V (3 hojas, 22/09/26) → **estilo vigente de potencia**.
- **TLC Ingreso** – Unifilar 24V (4 hojas A4) → **estilo vigente de 24 Vcc**.
- **TLC Ingreso** – Topográfico 2D (5 hojas) → **estilo vigente de topográfico**.
- TSBT Línea B 380V Sala Energía (4 hojas, 30/07/26) → referencia de tablero trifásico con UPS y bloques PD.
- Tablero CAS (YPF / Technology Bureau) → solo la hoja "Unifilares modificados" sigue el estilo propio; el resto es de un tercero y **no se usa como modelo**.

Regla de oro: **si un dato no está en el relevamiento, no se inventa.** Se dibuja el texto `A CONFIRMAR` en la capa `A_CONFIRMAR`.

---

# PARTE A – NÚCLEO (vale para todos los tableros)

## A1. Juego de planos de un tablero

Cada tablero se entrega como un juego, en este orden:

| Orden | Plano | Formato | Contenido |
| --- | --- | --- | --- |
| 1 | Unifilar potencia – Hoja 1 | A3 apaisado | Acometida, protección general, protector de sobretensión, luces piloto, borneras de distribución, tabla de PUESTA A TIERRA |
| 2..n | Unifilar potencia – Hojas de circuitos | A3 apaisado | Máximo **8 circuitos por hoja** |
| n+1.. | Unifilar 24V – una hoja por conjunto fuente/UPS | A4 vertical | Batería, fuente, UPS, convertidor, bornera de distribución 24V con fusibles |
| … | Conexión de relés / comunicaciones (si hay) | A3 | Relés, switches, conversores |
| último | Topográfico | A3 vertical | Vista frontal interior, cotas de bandejas, gabinete |

Los códigos de equipos (C01, BT-1, U-1, SW1…) son **los mismos en todos los planos del juego**.

## A2. Hoja, título y rótulo

| Ítem | Regla |
| --- | --- |
| Marco | Grilla 1–16 (arriba/abajo) y A–H (izq./der.); flecha de centrado en los cuatro lados |
| Bloque de revisiones | Arriba a la derecha: RevNo · Revision note · Date · Signature · Checked |
| Título | Arriba a la izquierda, 2 líneas: `TABLERO <nombre>` (7 mm) y `UNIFILAR <tensión> HOJA n` (4 mm) |
| Rótulo | **Siempre abajo a la derecha** (cliente, contratista, obra, parte, plano N° n/N, fecha) |
| Sello de estado | `PARA REVISION` grande arriba a la derecha mientras no esté aprobado; se quita en la versión final |
| Texto | Arial. Base 2,5 mm · rótulos de protección 2 mm · nombres especiales 4 mm · títulos 7 mm |

En los planos de 24 V (A4) el título va en una **banda gris oscura con texto blanco**: `UNIFILAR 24V - n`.

## A3. Códigos de equipos

| Equipo | Código | Ejemplo | Dónde se ve |
| --- | --- | --- | --- |
| Circuito (térmica + su diferencial + destino) | `Cnn` (2 dígitos) | C01 | Rótulo de la térmica, rótulo del diferencial y caja de destino |
| Térmica general / protector / especiales | Nombre | GENERAL, SOBRETENSION, E.UPS, S.UPS, RODEO | Rótulo en negrita |
| Bornera de distribución | `BNR-nn` | BNR-01 | A la derecha de la caja |
| Bloque de distribución | `PD-n` | PD-1 | Arriba a la izquierda del bloque |
| Fusible | `Fn` + calibre | F1 2A | En el portafusible |
| Batería | `BT-n` | BT-1 | Etiqueta gris oscura |
| Fuente | `C-n` (*) | C-1 | Etiqueta gris oscura |
| UPS | `U-n` | U-1 | Etiqueta gris oscura |
| Convertidor DC/DC | `CV-n` | CV-1 | Etiqueta gris oscura |
| Bornera 24V con fusibles | `Un-24V` / `Un-CVn-12V` | U1-24V | Título sobre la bornera |
| Relé | `RLY-nn` | RLY-01 | Etiqueta gris oscura |
| Switch | `SWn` | SW1 | Etiqueta |
| Inyector PoE | `POE-nn` | POE-15 | Debajo del equipo |
| Borne de tierra | `Tn` | T3 | Bornera de tierra y junto a cada destino |

(*) Ver Parte F: hoy conviven `C-1` y `FT-1` para la fuente.

**Etiqueta de equipo:** rectángulo relleno gris oscuro (RGB 64,64,64), texto blanco en negrita, centrado. Se usa igual en unifilar 24 V y en topográfico.

## A4. Numeración de conductores

| Serie | Formato | Uso |
| --- | --- | --- |
| Potencia | `A n` (con espacio, correlativo) | Todo conductor de 220/380 V |
| Piloto / mando | `P n` | Luces piloto y mando |
| Tierra | `T n` | Un número por equipo o circuito |
| 24 V / bornes de equipo | `<código sin guion><n>-<borne 2 dígitos>` | BT1-01, C1-02, U1-03, CV1-01 |
| Bornera 24V | `Un-<n>` | U1-1 … U1-60 |

Reglas:
1. El número **cambia al atravesar una protección** y **no cambia a lo largo de un cable** (mismo número en ambos extremos).
2. Se numera de arriba hacia abajo y de izquierda a derecha, en el orden de los circuitos.
3. En cada par de bornes, primero el neutro y después la fase (`A 31` = N, `A 32` = F).
4. Cuando un conductor de potencia entra a un equipo de 24 V (alimentación de fuente), se repite su número `A` y se agrega una caja de referencia `CIRCUITO n / FUENTE` (ver A8).

## A5. Símbolos (bloques con atributos)

| Bloque | Dibujo | Atributos |
| --- | --- | --- |
| TERMICA | Contacto IEC vertical, `×` arriba, cuchilla inclinada, gancho térmico con flecha | CODIGO, POLOS, IN, SECCION |
| DISYUNTOR | Térmica + óvalo de toroide + pulsador de prueba | CODIGO, CLASE (Común / S.I.), POLOS, IN, IDN, SECCION |
| BORNE | Círculo de 1,5 mm con diagonal (tornillo) | NUM, FASE |
| BORNERA | Caja con grupos por fase, letras grandes N / F (o R S T N) en el centro | CODIGO, SECCION |
| MARCA_CABLE | Trazo diagonal grueso | FORMACION |
| PORTAFUSIBLE | Rectángulo con `Fn` y calibre | CODIGO, IN |
| LUZ_PILOTO 220/380 | Círculo con cruz (monofásico) o con letra de fase y zigzag (trifásico) | TEXTO |
| LUZ_TESTIGO 24V | Círculo con cruz | TEXTO |
| ORIGEN | Círculo grande con procedencia (`De Tablero Facturación`) | TEXTO |
| PROTECTOR_SOBRETENSION | Rectángulo con texto, bajada a tierra con su `Tn` | — |
| TIERRA | Tres líneas decrecientes | — |
| DESTINO | Rectángulo vertical, borde grueso, código `Cnn` arriba y texto rotado 90° | CODIGO, DESTINO, TIERRA |
| EQUIPO_24V | Vista frontal del equipo (biblioteca de imágenes por modelo) + etiqueta gris | CODIGO, MARCA, MODELO |

## A6. Cables

- Marca diagonal sobre la línea + texto de formación **a la izquierda**: `2X1.5mm`, `2X2.5mm`, `4X16mm`.
- Formato fijo: `<conductores>X<sección>mm`, sección con punto decimal, sin espacios.
- Monofásico = 1 marca; trifásico + N = marca doble; cables en paralelo = dos marcas.
- Un tramo de cable por cada tramo entre bornes; nunca dos formaciones en un mismo tramo.

## A7. Puesta a tierra

- En la Hoja 1 del unifilar va el recuadro **PUESTA A TIERRA**: símbolo unipolar verde/amarillo con sección, bornera/barra de tierra con bornes T1…Tn y la lista `Tn – destino` (T1 Protector sobretensión, T2 Fuente 1 … T17 Gabinete, T18 PAT).
- Cada destino lleva al lado su `T n`.
- El protector de sobretensión baja a tierra con su propio `Tn`.

## A8. Referencias entre hojas

- Una línea que sigue en otra hoja termina en la grilla con el texto `HOJA n` en negrita.
- La alimentación de una fuente de 24 V se dibuja con una caja `CIRCUITO n / FUENTE` y los números `A` del circuito del unifilar de potencia, más la tierra `Tn`.

## A9. Capas y colores

| Capa | Contenido | Color |
| --- | --- | --- |
| MARCO | Marco, grilla, rótulo | 7 |
| POTENCIA | Líneas de 220/380 V | 7 |
| CC_POSITIVO | Conductores +24V / +12V | 1 (rojo) |
| CC_NEGATIVO | Conductores 0V | 7 |
| SEÑAL | Alarmas, FLT, entradas de controladora | 6 (magenta) |
| SIMBOLOS | Bloques | 7 |
| BORNES | Bornes y borneras | 7 |
| NUM_CONDUCTOR | Números A / P / T / equipo-borne | 7 (+ rojo para positivos en 24V) |
| CABLES | Marcas y formación | 7 |
| ETIQUETAS | Etiquetas grises de equipos | 8 |
| DESTINOS | Cajas de destino | 7 |
| A_CONFIRMAR | Datos faltantes | 30 |

---

# PARTE B – MÓDULO POTENCIA (220 V monofásico / 380 V trifásico)

## B1. Hoja 1 – cabecera (orden fijo, de arriba hacia abajo)

1. **ORIGEN** (círculo): `De Tablero Facturación` / `A TGBT Planta Baja…`.
2. Borneras de conexión inferior con sus `A` y rótulo `BORNERAS DE CONEXION INFERIOR <sección>`.
3. Cable de entrada.
4. Derivación a la derecha → cable `2X1mm` → portafusible `F1 2A` → **LUZ PILOTO ENTRADA GENERAL 220V** (en 380 V: tres fases R/S/T con F1–F3).
5. **Térmica GENERAL** con rótulo grande (4 mm): `Térmica / GENERAL / Bipolar / 2 X 25A / 4mm`.
6. **Bornera BNR-01** (N / F) que reparte a la general y al protector.
7. A la izquierda: **Térmica SOBRETENSION** → PROTECTOR SOBRETENSION → tierra `T3`.
8. **Bornera BNR-02** (distribución): caja ancha con grupo N a la izquierda y F a la derecha; bornes de entrada arriba y de salida abajo con sus números `A`. Rótulo `BORNERA <sección>`.
9. Recuadro **PUESTA A TIERRA** arriba a la derecha.

## B2. Hojas de circuitos

- Barra horizontal arriba con punto de unión en cada derivación; **8 circuitos por hoja**, separación constante.
- Cada circuito, de arriba hacia abajo:
  1. Cable `2XSmm` desde la barra.
  2. Bornes de entrada (N / F con sus `A`).
  3. Térmica, rótulo a la derecha: `Térmica / Cnn / Bipolar / 2X 10A / 1.5mm`.
  4. Bornes de salida.
  5. Cable.
  6. Bornes de entrada del diferencial.
  7. Disyuntor, rótulo: `Disyuntor / S.I. / Cnn / Bipolar / 2X 25A / 30mA / 1.5mm`.
  8. Bornes de salida.
  9. Cable.
  10. Bornes de destino.
  11. **Caja de destino** vertical: `Cnn` arriba en negrita, texto del destino rotado, y `T n` a la derecha.
- Todos los circuitos alineados: térmicas, diferenciales, bornes y destinos a la misma altura.
- Circuitos sin uso: `RESERVA n`, dibujados completos.

## B3. Trifásico (380 V)

- Bornes en vertical, orden fijo **R, S, T, N** de arriba hacia abajo.
- Monofásicos de un tablero trifásico: fase en rotación **R → S → T**, escrita en sus bornes.
- Equipos intermedios (UPS) en su columna con `E.UPS`, `S.UPS` y bypass `RODEO`, más EPO y LUZ PILOTO SALIDA UPS.
- Bloques de distribución `PD-n` (marca y modelo a la derecha) con su bornera PAT.

---

# PARTE C – MÓDULO 24 Vcc

Una hoja A4 vertical por cada conjunto batería / fuente / UPS.

## C1. Disposición fija

| Zona | Contenido |
| --- | --- |
| Arriba izquierda | Banda de título `UNIFILAR 24V - n` |
| Arriba | Señales de la controladora (`LENEL LNL - n FALTA DE TENSION (FLT)`, `INPUT 3`) en cajas grises con sus cables bajando a la UPS |
| Mitad izquierda | **PACK BATERIA** con marca/modelo grande y etiqueta `BT - n` |
| Mitad derecha | **FUENTE** (`C - n`) · **UPS** (`U - n`) · **CONVERTIDOR** (`CV - n`) en ese orden, con vista frontal |
| Debajo de la fuente | Entrada 220 V: bornes `A` + `T` y caja `CIRCUITO n / FUENTE` |
| Abajo | Bornera **Un-24V** y, si hay convertidor, **Un-CVn-12V** a su derecha |

## C2. Numeración de bornes de equipos

- `<equipo><n>-<borne>`: BT1-01, BT1-02, BT1-03 · C1-01, C1-02 · U1-01 … U1-04 · CV1-01, CV1-02.
- Color del texto: **rojo = positivo**, negro = negativo, magenta = señal/alarma.
- Junto a cada borne se indican los dos extremos del cable (`U1-04 / U1-03` en la llegada a la bornera).

## C3. Bornera de distribución 24 V

- Título encima: `Un-24V`.
- Una columna por fusible: `Un F1` … `Un Fn`.
- Fila superior de números **impares en rojo** (`U1-1, U1-3, …`) = +24V; fila inferior de números **pares en negro** (`U1-2, U1-4, …`) = 0V.
- Debajo, la **tabla de destinos**: una celda por columna, texto vertical (SWITCH 1, LENEL 1, PoE 15…). Las celdas de destinos de red (PoE) llevan fondo gris oscuro con texto blanco.
- Columnas libres: celda vacía (reserva).
- Bornera 12 V del convertidor: numeración continúa (U1-51 … U1-60).
- Luz testigo 24V en una columna final, con sus `Un`.

## C4. Cables 24 V

- Batería → UPS, fuente → UPS, UPS → bornera: `2X2.5mm`.
- Entrada 220 V a la fuente: `2X1.5mm`.
- Todos con marca diagonal y formación a la izquierda.

---

# PARTE D – TOPOGRÁFICO

- **Hoja 1–n:** vista frontal interior de cada cuerpo del gabinete, equipos a escala, rieles DIN y cablecanales, puntos de fijación en rojo.
- **Cada equipo** lleva debajo su etiqueta gris con el mismo código que en los unifilares (Térmica C01, Disyuntor S.I. C01, U-1, BT-1, SW1, POE-15, LENEL 1…).
- **Hoja de cotas:** alturas de cada bandeja (130, 160, 170, 220 mm…), ancho útil y altura total del gabinete.
- Gabinete con vista lateral y cotas totales (alto × ancho × profundidad) cuando es un solo cuerpo.

---

# PARTE G – REGLAS DE INTERPRETACIÓN (lectura del tablero)

Cómo convertir lo que se ve en el tablero (foto o relevamiento) en circuitos antes de dibujar. Se aplican en orden; lo que no encaje va `A CONFIRMAR`.

## G1. Orden de lectura y prioridad de evidencia
- Rieles de izquierda a derecha y de arriba hacia abajo; los circuitos se numeran C01, C02… en ese orden.
- Prioridad: 1) etiqueta en equipo o riel, 2) peine o puente visible, 3) reglas de posición.

## G2. Cabecera
- Lo primero después de la bornera de entrada es la **Térmica GENERAL**.
- Al lado va siempre el **protector de sobretensión** con su propia térmica **del mismo calibre que la general**, conectado **a la salida** de la general.
- La salida de la general va a una bornera de conexionado (BNR); de ahí se alimentan el protector y la distribución.
- Disyuntor inmediatamente después de la general = **disyuntor general** → los circuitos **no** llevan disyuntor propio (edificios / oficinas). En tablero industrial se agrega observación (se recomienda uno por circuito).

## G3. Zona UPS y zona común
- UPS = **tres térmicas juntas del mismo calibre, sin disyuntor**: E.UPS, BYPASS, S.UPS.
- Lo que cuelga de S.UPS (directo o por su bornera) es **zona UPS**; el resto, **zona común**. No se mezclan en un mismo grupo.
- La barra de salida **continúa aunque cambie de riel**.

## G4. Asociación térmica ↔ disyuntor

| Patrón en el riel | Interpretación | Uso |
| --- | --- | --- |
| `T D T D` | Pares 1 a 1, térmica con el disyuntor que la sigue | UPS / industrial |
| `D T D T` | Pares 1 a 1, disyuntor con la térmica que lo sigue | UPS / industrial |
| `T T T` arriba y `D D D` abajo | **Cascada**: misma posición = mismo circuito | Montaje en dos rieles |
| `D T T T` | **Grupo**: un disyuntor para todas las térmicas que siguen hasta el próximo disyuntor | Zona común |

Decisión: después de cada disyuntor se cuentan las térmicas hasta el próximo disyuntor. **1 = par; 2 o más = grupo.** Si la zona arranca con térmica, se aplica `T D`.
En el dibujo: térmica arriba y disyuntor abajo; en un grupo, el disyuntor primero y las térmicas colgando de su salida.

## G5. Circuitos sin disyuntor
- Solo las tres térmicas de la UPS. Cualquier otra térmica sin disyuntor se dibuja tal cual con **observación de seguridad**.

## G6. Borneras

| Tipo | Ubicación | Función |
| --- | --- | --- |
| Simple con freno y separadores | Riel inferior | Conexiones externas de energía: entrada general, entrada/salida UPS, salidas de circuitos |
| Bornes de energía entre niveles | Junto a protecciones | Conexionado / distribución (BNR) |
| Doble piso con fusible | Junto a fuente/UPS o riel de abajo | Distribución 24 V (Un-24V) |
| Doble piso sin fusible | Zona de controladoras | Conexionado de control de acceso |

- Toda térmica de circuito sale por la bornera inferior, excepto fuentes y tomas internas (conexión directa).

## G7. Equipos y alimentación

| Equipo | Alimentación |
| --- | --- |
| Lenel, PoE 24 V, switches, relés | 24 V desde Un-24V |
| PoE 220 V, transformadores 220 V | Circuito de 220 V |
| Fuentes 24 V | Circuito de 220 V propio |

## G8. Controles
- Disyuntor ≥ térmica que protege.
- Tres térmicas de UPS del mismo calibre.
- Térmica del protector del mismo calibre que la general.

---

# PARTE E – DATOS DE ENTRADA Y VALIDACIONES

```json
{
  "tablero": "TSBT CCTV-CCAA Ingreso TLC",
  "tension": "220V", "sistema": "monofasico",
  "origen": "De Tablero Facturacion",
  "general": {"polos": 2, "in": 25, "seccion": 4},
  "sobretension": {"polos": 2, "in": 25, "seccion": 4, "tierra": "T1"},
  "piloto_entrada": {"fusible": "F1", "in": 2},
  "circuitos": [
    {"codigo": "C01", "termica": {"in": 10, "seccion": 1.5},
     "diferencial": {"clase": "S.I.", "in": 25, "idn": 30},
     "destino": "FUENTE 1", "tierra": "T2"}
  ],
  "sistemas_24v": [
    {"n": 1, "bateria": "PhoenixContact 2320322 BAT_VRLA 24DC_12AH",
     "fuente": "QUINT4-PS-1AC-24DC-20A", "ups": "QUINT4-UPS/24DC/24DC/20",
     "convertidor": "QUINT4-PS/24DC/12DC/8", "circuito_220": "C03",
     "salidas_24v": ["SWITCH 1", "LENEL 1", "LENEL 2"],
     "salidas_12v": ["SEM E 1", "SEM E 2"]}
  ]
}
```

Controles antes de entregar:
- [ ] Polos y corriente coherentes (Bipolar ⇔ 2X).
- [ ] Ningún número `A` repetido en cables distintos; ningún salto en la numeración.
- [ ] Mismo código de circuito en térmica, diferencial y destino.
- [ ] Cada destino con su `T n` y la tabla de PUESTA A TIERRA completa.
- [ ] Sección del cable acorde a la protección.
- [ ] Códigos de equipos idénticos en unifilar 220, unifilar 24V y topográfico.
- [ ] Máximo 8 circuitos por hoja y referencias `HOJA n` en los cortes.
- [ ] Textos sin errores de tipeo (`2.5mm`, `A 117`).

---

# PARTE F – DECISIONES A CONFIRMAR (diferencias entre planos)

| Tema | Plano A | Plano B | Propuesta |
| --- | --- | --- | --- |
| Código de circuito | `C 1` + `D 1` (TSBT 380, jul) | `C01` en térmica y diferencial (TLC, sep) | `C01` (más nuevo) |
| Letras de fase monofásico | R / S / T | F / N | F / N en 220 V; R/S/T solo en tableros trifásicos |
| Borneras | "BORNERAS DE CONEXION SUPERIOR" | `BNR-01`, `BNR-02` | `BNR-nn` + descripción |
| Código de fuente | `C - 1` / conductores `C1-01` (TLC 24V) | `FT - 1` / `CC1-01` (CAS modificado) | Definir uno; `C` choca con circuitos → sugerido `FT-n` |
| Bornera 24V | Prefijo `U1` (igual que la UPS) | — | Mantener `Un-24V` y documentar que la bornera toma el número de la UPS que la alimenta |
| Ubicación del rótulo | Cambia de esquina según hoja (TSBT 380) | Siempre abajo a la derecha (TLC) | Abajo a la derecha |
| Título | Bloque grande centrado (TSBT 380) | Arriba a la izquierda (TLC) | Arriba a la izquierda |
| Fusibles por bornera 24V | 25 (U1, U2) | 30 (U3, U4) | Cantidad según relevamiento |

Errores detectados en los planos de referencia: C1/C2 "Bipolar 4X 20A" (TSBT 380); dos destinos "CIRCUITO 4"; "2.5mmmm"; "A 1B7" en lugar de "A 117" (TLC hoja 3); orden de bornes trifásicos distinto entre circuitos.
