/**
 * Harness de validación del enfoque "IA interpreta + dibuja" (no el motor
 * geométrico viejo). Acá no hay llamada real a la API de Anthropic — no hay
 * ANTHROPIC_API_KEY en este entorno sandbox — así que el `DrawCommand[]` de
 * abajo está armado a mano, siguiendo exactamente REGLAS_UNIFILAR.md (Partes
 * A, B, G, H) como lo haría la IA en producción. El objetivo de este script
 * es otro: probar que ESE camino (reglas + datos reales → DrawCommand[])
 * funciona de punta a punta con el escritor DXF real de la app, sin tocar
 * nada de `lib/tableros/unifilar.ts`.
 *
 * Datos: los primeros 8 circuitos reales de FIXTURE_UNIFILAR (numero 1 =
 * General, 4-19 = C.C.T.V. a RACK Nº06) — el mismo tablero de las fotos
 * (confirmado: los textos coinciden). El orden real de la cadena, leído de
 * `padreNumero` en la base (no de B2, que es solo un ejemplo ilustrativo),
 * es DISYUNTOR primero (cuelga directo del general) y TÉRMICA segundo
 * (cuelga del disyuntor) — al revés del orden que muestra el DXF de
 * referencia para SU circuito C01. G4 ya anticipa que las dos variantes
 * existen ("T D" y "D T"); acá se respeta lo que dice la base, nunca el
 * orden de un ejemplo.
 *
 * Uso: npx tsx scripts/probar-ia-unifilar.ts [directorio-salida]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { drawCommandsToDxf } from "../src/lib/dxf/writer";
import type { DrawCommand } from "../src/lib/tableros/unifilar";
import { FIXTURE_UNIFILAR } from "./dev-unifilar-fixture";

const outDir = process.argv[2] ?? "/tmp/ia-unifilar-harness";
mkdirSync(outDir, { recursive: true });

// Los 8 circuitos reales (ver fixture: numero 4-19, pares disyuntor+térmica)
const circuitos = FIXTURE_UNIFILAR.filter((c) => c.numero >= 4 && c.numero <= 19);
const destinos = circuitos.filter((c) => c.categoriaEquipo === "disyuntor" && c.padreNumero === 1);

const commands: DrawCommand[] = [];
function L(x1: number, y1: number, x2: number, y2: number, layer: DrawCommand["layer"] = "POTENCIA") {
  commands.push({ type: "line", x1, y1, x2, y2, layer });
}
function T(x: number, y: number, text: string, size: number, layer: DrawCommand["layer"] = "ETIQUETAS", bold = false) {
  commands.push({ type: "text", x, y, text, size, bold, layer });
}
function C(x: number, y: number, r: number, layer: DrawCommand["layer"] = "BORNES") {
  commands.push({ type: "circle", x, y, r, layer });
}
function R(x: number, y: number, width: number, height: number, layer: DrawCommand["layer"] = "MARCO") {
  commands.push({ type: "rect", x, y, width, height, layer });
}

// ---- marco A3 apaisado (420x297mm), grilla 1-16/A-H, A2 ----
const W = 420, H = 297, M = 10;
R(M, M, W - 2 * M, H - 2 * M, "MARCO");
for (let i = 0; i <= 16; i++) {
  const gx = M + (i * (W - 2 * M)) / 16;
  L(gx, M, gx, M + 2.2, "MARCO");
  L(gx, H - M, gx, H - M - 2.2, "MARCO");
}
T(M + 4, M + 9, "TABLERO DE PRUEBA 11 (harness IA)", 7, "ETIQUETAS", true);
T(M + 4, M + 15.5, "UNIFILAR 220V HOJA 1", 4, "ETIQUETAS");
T(W - M - 4, M + 9, "PARA REVISIÓN", 5, "A_CONFIRMAR", true);

// ---- cabecera: GENERAL + GRUPO ELECTROGENO (H10) + POWERMETER (H11) ----
const startX = 46, pitch = 46, genX = 140, busY = 110;

// GENERAL: térmica que baja directo a la barra (su entrada real —
// acometida/bornera inferior — queda fuera de este harness acotado).
L(genX, 28, genX, 35, "POTENCIA");
L(genX - 1.4, 31.6, genX + 1.4, 34.4, "SIMBOLOS");
L(genX - 1.4, 34.4, genX + 1.4, 31.6, "SIMBOLOS");
T(genX + 3, 30, "GENERAL", 2.6, "ETIQUETAS", true);
T(genX + 3, 33.5, "Bipolar · IN A CONFIRMAR", 1.8, "A_CONFIRMAR");
L(genX, 35, genX, busY, "POTENCIA");

// GRUPO ELECTROGENO (H10): entra por bornera inferior (de afuera del
// tablero), sube a su propia térmica por arriba, y la salida va a la
// MISMA barra que la salida de GENERAL — rama independiente, ninguna es
// padre de la otra.
const grupoX = 20;
R(grupoX - 5, busY + 45, 10, 6, "BORNES");
T(grupoX + 3, busY + 49.5, "Desde GRUPO", 1.5, "ETIQUETAS");
T(grupoX + 3, busY + 52.5, "ELECTRÓGENO", 1.5, "ETIQUETAS");
T(grupoX + 3, busY + 55.5, "(bornera inf.)", 1.3, "ETIQUETAS");
L(grupoX, busY + 45, grupoX, busY + 36.4, "POTENCIA");
L(grupoX - 1.4, busY + 33.6, grupoX + 1.4, busY + 36.4, "SIMBOLOS");
L(grupoX - 1.4, busY + 36.4, grupoX + 1.4, busY + 33.6, "SIMBOLOS");
T(grupoX + 3, busY + 30.5, "GRUPO", 1.8, "ETIQUETAS", true);
T(grupoX + 3, busY + 33.5, "ELECTROGENO", 1.8, "ETIQUETAS", true);
T(grupoX + 3, busY + 40, "IN A CONFIRMAR", 1.5, "A_CONFIRMAR");
L(grupoX, busY + 33.6, grupoX, busY, "POTENCIA");
L(grupoX, busY, startX, busY, "POTENCIA"); // se une a la misma barra que GENERAL (el tramo startX→genX ya es la barra principal)

// POWERMETER (H11): alimentado en 24V (Un-24V), mide sobre el
// alimentador de GENERAL, instalado en el frente del tablero — no cuelga
// de la cadena térmica→disyuntor→destino de ningún circuito.
const pmX = genX + 45, pmY = 45;
commands.push({ type: "circle", x: pmX, y: pmY, r: 4, layer: "SIMBOLOS" });
T(pmX, pmY + 1, "PM-1", 2, "SIMBOLOS", true);
L(pmX - 4, pmY, genX, 31, "ETIQUETAS"); // línea de referencia de medición
T(pmX + 5, pmY - 2, "MEDICIÓN", 1.6, "ETIQUETAS");
L(pmX, pmY + 4, pmX, pmY + 10, "CABLES");
T(pmX + 5, pmY + 10, "24V · Un-24V", 1.6, "ETIQUETAS");

// ---- barra horizontal (H7: una barra por zona de tensión) ----
const lastX = startX + (destinos.length - 1) * pitch;
L(startX, busY, lastX, busY, "POTENCIA");
L(startX, busY + 1.4, lastX, busY + 1.4, "POTENCIA");
T(startX, busY - 2.5, "De Tablero General — distribución 220V", 2.1, "ETIQUETAS");

let aCounter = 1;
function nextA() {
  return aCounter++;
}

destinos.forEach((disyuntor, idx) => {
  const termica = circuitos.find((c) => c.padreNumero === disyuntor.numero && c.categoriaEquipo === "termica");
  if (!termica) throw new Error(`Sin térmica hija para ${disyuntor.texto}`);
  const destinoTexto = disyuntor.texto.replace(/\s*-\s*INT\.\s*DIFER\.?.*/i, "").trim();
  const codigo = `C${String(idx + 1).padStart(2, "0")}`;
  const cx = startX + idx * pitch;
  let y = busY;
  C(cx, y, 0.9, "POTENCIA");

  // --- tramo barra -> disyuntor (H8: mismo número en ambas puntas) ---
  const a1 = nextA(), a2 = nextA();
  L(cx, y, cx, y + 4, "CABLES");
  L(cx - 1.3, y + 4, cx + 1.3, y + 5.6, "CABLES"); // marca de cable (A6)
  T(cx - 20, y + 5.3, "SECCIÓN A CONFIRMAR", 1.7, "A_CONFIRMAR");
  L(cx, y + 4, cx, y + 10, "POTENCIA");
  [["N", a1], ["F", a2]].forEach(([letra, n], bi) => {
    const by = y + 7 + bi * 3;
    C(cx, by, 0.7, "BORNES");
    T(cx - 2.2, by + 0.7, String(letra), 1.6, "ETIQUETAS");
    T(cx + 2.2, by + 0.7, `A ${n}`, 1.6, "NUM_CONDUCTOR");
  });

  // --- disyuntor (A5: térmica + toroide + pulsador) ---
  const yd = y + 18;
  L(cx, y + 10, cx, yd, "POTENCIA");
  commands.push({ type: "ellipse", x: cx, y: yd - 4.5, rx: 2.1, ry: 1.3, layer: "SIMBOLOS" });
  L(cx - 1.4, yd - 1.4, cx + 1.4, yd + 1.4, "SIMBOLOS");
  L(cx - 1.4, yd + 1.4, cx + 1.4, yd - 1.4, "SIMBOLOS");
  T(cx + 3, yd - 6, "Disyuntor", 2.4, "ETIQUETAS", true);
  T(cx + 3, yd - 2.8, codigo, 2, "ETIQUETAS");
  T(cx + 3, yd + 1, `Bipolar · ${disyuntor.ampNominal ?? "A CONFIRMAR"} · 30mA`, 1.8, "ETIQUETAS");

  // --- tramo disyuntor -> térmica (mismo tramo, A8 propio por H8) ---
  const yt = yd + 6;
  const a3 = nextA(), a4 = nextA();
  L(cx, yd + 1.4, cx, yt, "POTENCIA");
  L(cx - 1.3, yt - 3, cx + 1.3, yt - 1.4, "CABLES");
  [["N", a3], ["F", a4]].forEach(([letra, n], bi) => {
    const by = yt + bi * 3;
    C(cx, by, 0.7, "BORNES");
    T(cx - 2.2, by + 0.7, String(letra), 1.6, "ETIQUETAS");
    T(cx + 2.2, by + 0.7, `A ${n}`, 1.6, "NUM_CONDUCTOR");
  });

  // --- termica (A5: contacto IEC, cuchilla inclinada) ---
  const yte = yt + 10;
  L(cx, yt + 3, cx, yte, "POTENCIA");
  L(cx - 1.4, yte - 1.4, cx + 1.4, yte + 1.4, "SIMBOLOS");
  L(cx - 1.4, yte + 1.4, cx + 1.4, yte - 1.4, "SIMBOLOS");
  T(cx + 3, yte - 2.5, "Térmica", 2.4, "ETIQUETAS", true);
  T(cx + 3, yte + 1, codigo, 2, "ETIQUETAS");
  T(cx + 3, yte + 4.2, `Bipolar · ${termica.ampNominal ?? "A CONFIRMAR"}`, 1.8, "ETIQUETAS");

  // --- tramo termica -> destino ---
  const yb3 = yte + 1.4 + 5;
  const a5 = nextA(), a6 = nextA();
  L(cx, yte + 1.4, cx, yb3, "POTENCIA");
  L(cx - 1.3, yb3 - 3, cx + 1.3, yb3 - 1.4, "CABLES");
  [["N", a5], ["F", a6]].forEach(([letra, n], bi) => {
    const by = yb3 + bi * 3;
    C(cx, by, 0.7, "BORNES");
    T(cx - 2.2, by + 0.7, String(letra), 1.6, "ETIQUETAS");
    T(cx + 2.2, by + 0.7, `A ${n}`, 1.6, "NUM_CONDUCTOR");
  });
  const yBoxTop = yb3 + 8;
  L(cx, yb3 + 3, cx, yBoxTop, "POTENCIA");

  // --- caja de destino (A5: estirada hasta un piso común de la hoja) ---
  const boxW = 15, boxBottom = 215;
  R(cx - boxW / 2, yBoxTop, boxW, boxBottom - yBoxTop, "DESTINOS");
  T(cx, yBoxTop + 5, codigo, 3, "DESTINOS", true);
  T(cx - 2.6, boxBottom - 4, destinoTexto, 2.1, "DESTINOS");

  // --- Tn (A7) ---
  const tn = idx + 2;
  const ty0 = boxBottom + 5;
  [0, 1.3, 2.6].forEach((off, k) => {
    const w = 3 - k * 0.9;
    L(cx - w / 2, ty0 + off, cx + w / 2, ty0 + off, "DESTINOS");
  });
  T(cx + 2.6, ty0 + 1.5, `T${tn}`, 2.1, "DESTINOS", true);
});

const buf = drawCommandsToDxf(commands, H);
const path = `${outDir}/ia-unifilar-harness.dxf`;
writeFileSync(path, buf);
console.log(`DXF escrito: ${path} (${buf.length} bytes, ${commands.length} comandos, ${destinos.length} circuitos)`);
