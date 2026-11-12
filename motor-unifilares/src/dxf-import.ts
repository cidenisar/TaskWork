/**
 * Importador de la librería de símbolos desde un DXF real (ver
 * CRITERIOS_Y_IDEAS.md, §22-23) — lee cada BLOCK nombrado del archivo y
 * convierte su geometría real a DrawCommand[], sin que la IA interprete
 * nada (a diferencia de "enseñar", ver src/ensenar.ts). Usa `dxf-parser`
 * (puro Node/TS, sin Python/ezdxf) porque el deploy real corre en
 * funciones serverless de Vercel.
 *
 * Todo el trabajo geométrico (resolver INSERT anidados, arcos, bulges de
 * polilínea, elipses rotadas) se hace en coordenadas nativas del DXF
 * (CAD, Y crece hacia arriba) — el único cambio de convención (Y crece
 * hacia abajo, como el resto del motor) se aplica una sola vez, al final,
 * sobre los puntos ya resueltos. Mezclar el flip de Y con la rotación
 * invierte el sentido de giro si no se hace con cuidado — separarlos así
 * evita tener que razonar sobre signos de ángulo en cada paso.
 */
// `dxf-parser` tiene un desajuste entre "main" (el bundle que Node carga
// en runtime, donde el export ES la clase directo) y "types" (describe un
// build distinto, con la clase como default export de un módulo con
// named exports) — el default import funciona bien en runtime (probado:
// `new DxfParserCtor()` anda) pero TS lo marca "no construible" porque
// typa contra el build equivocado. Cast explícito, documentado, en vez de
// pelear con la config de resolución de módulos por un solo paquete.
import DxfParserCtor from "dxf-parser";
import type {
  IDxf,
  IBlock,
  IEntity,
  IPoint,
  ILineEntity,
  ICircleEntity,
  IArcEntity,
  IEllipseEntity,
  ILwpolylineEntity,
  IPolylineEntity,
  ISolidEntity,
  IInsertEntity,
  ITextEntity,
  IMtextEntity,
} from "dxf-parser";
import { CAPAS_DXF, type CapaDxf, type DrawCommand } from "./types.js";
import { trasladarXY } from "./simbolos/index.js";

const DxfParser = DxfParserCtor as unknown as new () => { parseSync(source: string): IDxf | null };

export interface BloqueDetectado {
  nombre: string;
  descripcionSugerida: string;
  commands: DrawCommand[];
  ancho: number;
  alto: number;
  capasNoReconocidas: string[];
  entidadesNoSoportadas: string[];
}

export interface BloqueFallido {
  nombre: string;
  error: string;
}

interface Punto {
  x: number;
  y: number;
}

const CAPAS_VALIDAS = new Set<string>(CAPAS_DXF);

/**
 * Terminadores de cota estándar que AutoCAD agrega siempre (flechas de
 * dimensión) — definidos en la especificación DXF, con nombre fijo con
 * "_" adelante, nunca un símbolo real de la librería del usuario.
 */
const BLOQUES_SISTEMA_AUTOCAD = new Set([
  "_ARCHTICK", "_BOXBLANK", "_BOXFILLED", "_CLOSED", "_CLOSEDBLANK", "_CLOSEDFILLED",
  "_DATUMBLANK", "_DATUMFILLED", "_DOT", "_DOTBLANK", "_DOTSMALL", "_INTEGRAL", "_NONE",
  "_OBLIQUE", "_OPEN", "_OPEN30", "_OPENBLANK", "_ORIGIN", "_ORIGIN2", "_RTRIANGLE", "_SMALL",
  "_ACAD_MLEADERVER",
]);

/** Bloques internos que el propio DXF agrega (espacio de modelo/papel, anónimos de dimensión/hatch, flechas de cota) — nunca son símbolos reales para esta librería. */
function esBloqueInterno(nombre: string): boolean {
  return nombre.startsWith("*") || BLOQUES_SISTEMA_AUTOCAD.has(nombre.toUpperCase());
}

function mapearCapa(nombreCapaDxf: string | undefined, capasNoReconocidas: Set<string>): CapaDxf {
  const candidata = (nombreCapaDxf ?? "").toUpperCase();
  if (CAPAS_VALIDAS.has(candidata)) return candidata as CapaDxf;
  // Capa "0" (o sin capa) es la convención más común para dibujar bloques
  // en AutoCAD (ByBlock) — no es un nombre "raro", no vale la pena
  // avisarlo como si lo fuera.
  if (nombreCapaDxf && candidata !== "0") capasNoReconocidas.add(nombreCapaDxf);
  return "SIMBOLOS";
}

// === Representación intermedia, en coordenadas CAD nativas (Y arriba) ===

type PrimitivaInterna =
  | { tipo: "polilinea"; puntos: Punto[]; cerrada: boolean; layer: CapaDxf; rellena: boolean }
  | { tipo: "circulo"; centro: Punto; r: number; layer: CapaDxf }
  | { tipo: "elipseSinRotar"; centro: Punto; rx: number; ry: number; layer: CapaDxf }
  | { tipo: "texto"; posicion: Punto; texto: string; tamano: number; layer: CapaDxf };

function restar(p: IPoint, base: Punto): Punto {
  return { x: p.x - base.x, y: p.y - base.y };
}

/** Puntos sobre un arco de círculo centrado en (cx,cy) — se usa para ARC y para aproximar elipses rotadas/bulges de polilínea con suficiente resolución para que a escala de símbolo (pocos mm) se vea curvo. */
function puntosDeArco(cx: number, cy: number, r: number, anguloInicioRad: number, anguloFinRad: number, segmentosPorVuelta = 48): Punto[] {
  let barrido = anguloFinRad - anguloInicioRad;
  while (barrido <= 0) barrido += Math.PI * 2;
  const segmentos = Math.max(8, Math.ceil((barrido / (Math.PI * 2)) * segmentosPorVuelta));
  const puntos: Punto[] = [];
  for (let i = 0; i <= segmentos; i++) {
    const a = anguloInicioRad + (barrido * i) / segmentos;
    puntos.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return puntos;
}

/**
 * Arco implícito entre dos vértices de una LWPOLYLINE/POLYLINE con bulge
 * (fórmula estándar de DXF: ángulo incluido = 4·atan(bulge), signo según
 * sentido horario/antihorario) — devuelve los puntos intermedios del arco
 * SIN repetir p1/p2 (ya están en la lista de vértices de la polilínea).
 */
function puntosDeBulge(p1: Punto, p2: Punto, bulge: number): Punto[] {
  const theta = 4 * Math.atan(bulge);
  const cuerdaX = p2.x - p1.x;
  const cuerdaY = p2.y - p1.y;
  const largoCuerda = Math.hypot(cuerdaX, cuerdaY);
  if (largoCuerda < 1e-9 || Math.abs(theta) < 1e-6) return [];
  const radio = largoCuerda / (2 * Math.abs(Math.sin(theta / 2)));
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const mitad = Math.sqrt(Math.max(0, radio * radio - (largoCuerda / 2) ** 2));
  // Normal unitaria a la cuerda (rotada 90° a la izquierda de p1→p2); el bulge
  // positivo es antihorario (el centro queda a la izquierda de p1→p2).
  const nx = -cuerdaY / largoCuerda;
  const ny = cuerdaX / largoCuerda;
  const signo = bulge >= 0 ? 1 : -1;
  const cx = mx + nx * mitad * signo;
  const cy = my + ny * mitad * signo;
  const anguloInicio = Math.atan2(p1.y - cy, p1.x - cx);
  const anguloFin = Math.atan2(p2.y - cy, p2.x - cx);
  const todos = bulge >= 0 ? puntosDeArco(cx, cy, radio, anguloInicio, anguloFin) : puntosDeArco(cx, cy, radio, anguloFin, anguloInicio).reverse();
  // Sin los extremos — ya están en la lista de vértices original.
  return todos.slice(1, -1);
}

function detectarRectanguloAxisAligned(puntos: Punto[]): { x: number; y: number; width: number; height: number } | null {
  if (puntos.length !== 4) return null;
  const EPS = 1e-3;
  const xs = puntos.map((p) => p.x);
  const ys = puntos.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  if (maxX - minX < EPS || maxY - minY < EPS) return null;
  const esquinas: Punto[] = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  const todasEnEsquina = puntos.every((p) => esquinas.some((e) => Math.abs(p.x - e.x) < EPS && Math.abs(p.y - e.y) < EPS));
  if (!todasEnEsquina) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function convertirEntidad(entity: IEntity, base: Punto, capasNoReconocidas: Set<string>, entidadesNoSoportadas: Set<string>): PrimitivaInterna[] {
  const layer = mapearCapa(entity.layer, capasNoReconocidas);
  switch (entity.type) {
    case "LINE": {
      const e = entity as ILineEntity;
      return [{ tipo: "polilinea", puntos: e.vertices.map((v) => restar(v, base)), cerrada: false, layer, rellena: false }];
    }
    case "CIRCLE": {
      const e = entity as ICircleEntity;
      return [{ tipo: "circulo", centro: restar(e.center, base), r: e.radius, layer }];
    }
    case "ARC": {
      const e = entity as IArcEntity;
      const c = restar(e.center, base);
      return [{ tipo: "polilinea", puntos: puntosDeArco(c.x, c.y, e.radius, e.startAngle, e.endAngle), cerrada: false, layer, rellena: false }];
    }
    case "ELLIPSE": {
      const e = entity as IEllipseEntity;
      const c = restar(e.center, base);
      // majorAxisEndPoint es un VECTOR relativo al centro (spec DXF, grupo 11) — no se le resta `base`.
      const m = e.majorAxisEndPoint;
      const largoMayor = Math.hypot(m.x, m.y);
      const rotacionMayor = Math.atan2(m.y, m.x);
      const largoMenor = largoMayor * e.axisRatio;
      const a0 = e.startAngle ?? 0;
      const a1 = e.endAngle ?? Math.PI * 2;
      const esCompleta = Math.abs(a1 - a0) < 1e-6 || Math.abs(Math.abs(a1 - a0) - Math.PI * 2) < 1e-3;
      if (Math.abs(rotacionMayor) < 1e-3 && esCompleta) {
        return [{ tipo: "elipseSinRotar", centro: c, rx: largoMayor, ry: largoMenor, layer }];
      }
      let barrido = a1 - a0;
      while (barrido <= 0) barrido += Math.PI * 2;
      const segmentos = esCompleta ? 48 : Math.max(12, Math.ceil((barrido / (Math.PI * 2)) * 48));
      const puntos: Punto[] = [];
      for (let i = 0; i <= segmentos; i++) {
        const t = a0 + (barrido * i) / segmentos;
        const lx = largoMayor * Math.cos(t);
        const ly = largoMenor * Math.sin(t);
        puntos.push({
          x: c.x + lx * Math.cos(rotacionMayor) - ly * Math.sin(rotacionMayor),
          y: c.y + lx * Math.sin(rotacionMayor) + ly * Math.cos(rotacionMayor),
        });
      }
      return [{ tipo: "polilinea", puntos, cerrada: esCompleta, layer, rellena: false }];
    }
    case "LWPOLYLINE":
    case "POLYLINE": {
      const e = entity as ILwpolylineEntity | IPolylineEntity;
      const vertices = e.vertices;
      const puntosBase = vertices.map((v) => restar(v, base));
      const cerrada = !!(e as ILwpolylineEntity).shape;
      const puntosFinal: Punto[] = [];
      for (let i = 0; i < puntosBase.length; i++) {
        puntosFinal.push(puntosBase[i]);
        const esUltimo = i === puntosBase.length - 1;
        if (esUltimo && !cerrada) break;
        const bulge = (vertices[i] as { bulge?: number }).bulge;
        if (bulge) {
          const siguiente = esUltimo ? puntosBase[0] : puntosBase[i + 1];
          puntosFinal.push(...puntosDeBulge(puntosBase[i], siguiente, bulge));
        }
      }
      return [{ tipo: "polilinea", puntos: puntosFinal, cerrada, layer, rellena: false }];
    }
    case "SOLID": {
      const e = entity as ISolidEntity;
      const puntos = e.points.filter(Boolean).map((p) => restar(p, base));
      const unicos = puntos.filter((p, i) => i === 0 || Math.hypot(p.x - puntos[i - 1].x, p.y - puntos[i - 1].y) > 1e-6);
      // SOLID define 2 triángulos que comparten la diagonal 1-2/3-4 — el
      // orden de dibujo correcto como polígono simple es 1,2,4,3.
      const ordenados = unicos.length === 4 ? [unicos[0], unicos[1], unicos[3], unicos[2]] : unicos;
      return [{ tipo: "polilinea", puntos: ordenados, cerrada: true, layer, rellena: true }];
    }
    case "TEXT": {
      const e = entity as ITextEntity;
      return [{ tipo: "texto", posicion: restar(e.startPoint, base), texto: e.text, tamano: e.textHeight || 3, layer }];
    }
    case "MTEXT": {
      const e = entity as IMtextEntity;
      return [{ tipo: "texto", posicion: restar(e.position, base), texto: e.text, tamano: e.height || 3, layer }];
    }
    default:
      entidadesNoSoportadas.add(entity.type);
      return [];
  }
}

/** Solo traslada/refleja puntos (dx,dy fijos, sin escalar ni rotar) — lo que hace falta para el flip de Y final y la normalización por bbox, donde radios/tamaños nunca cambian. */
function transformarPrimitivas(primitivas: PrimitivaInterna[], f: (p: Punto) => Punto): PrimitivaInterna[] {
  return primitivas.map((p) => {
    switch (p.tipo) {
      case "polilinea":
        return { ...p, puntos: p.puntos.map(f) };
      case "circulo":
        return { ...p, centro: f(p.centro) };
      case "elipseSinRotar":
        return { ...p, centro: f(p.centro) };
      case "texto":
        return { ...p, posicion: f(p.posicion) };
    }
  });
}

function rotarEscalarTrasladar(p: Punto, rotacionRad: number, xScale: number, yScale: number, dx: number, dy: number): Punto {
  const xe = p.x * xScale;
  const ye = p.y * yScale;
  const cos = Math.cos(rotacionRad);
  const sin = Math.sin(rotacionRad);
  return { x: xe * cos - ye * sin + dx, y: xe * sin + ye * cos + dy };
}

/**
 * Aplica la transformación propia de un INSERT (rotar + escalar +
 * trasladar) a las primitivas ya resueltas del bloque referenciado —a
 * diferencia de `transformarPrimitivas` (solo mueve puntos), ESTA función
 * también tiene que ajustar radio/tamaño cuando hay escala, porque un
 * círculo con escala no uniforme (xScale≠yScale) deja de ser un círculo
 * (pasa a dibujarse como polígono muestreado para no perder la forma).
 */
function aplicarTransformInsert(primitivas: PrimitivaInterna[], rotacionRad: number, xScale: number, yScale: number, dx: number, dy: number): PrimitivaInterna[] {
  const transformarPunto = (p: Punto) => rotarEscalarTrasladar(p, rotacionRad, xScale, yScale, dx, dy);
  const uniforme = Math.abs(Math.abs(xScale) - Math.abs(yScale)) < 1e-9;
  return primitivas.flatMap((p): PrimitivaInterna[] => {
    switch (p.tipo) {
      case "polilinea":
        return [{ ...p, puntos: p.puntos.map(transformarPunto) }];
      case "texto":
        return [{ ...p, posicion: transformarPunto(p.posicion), tamano: p.tamano * Math.sqrt(Math.abs(xScale * yScale)) }];
      case "circulo": {
        if (uniforme) return [{ ...p, centro: transformarPunto(p.centro), r: p.r * Math.abs(xScale) }];
        const puntosOriginales = puntosDeArco(p.centro.x, p.centro.y, p.r, 0, Math.PI * 2);
        return [{ tipo: "polilinea", puntos: puntosOriginales.map(transformarPunto), cerrada: true, layer: p.layer, rellena: false }];
      }
      case "elipseSinRotar": {
        if (uniforme) return [{ ...p, centro: transformarPunto(p.centro), rx: p.rx * Math.abs(xScale), ry: p.ry * Math.abs(xScale) }];
        const puntosOriginales: Punto[] = [];
        const segmentos = 48;
        for (let i = 0; i <= segmentos; i++) {
          const t = (Math.PI * 2 * i) / segmentos;
          puntosOriginales.push({ x: p.centro.x + p.rx * Math.cos(t), y: p.centro.y + p.ry * Math.sin(t) });
        }
        return [{ tipo: "polilinea", puntos: puntosOriginales.map(transformarPunto), cerrada: true, layer: p.layer, rellena: false }];
      }
    }
  });
}

const PROFUNDIDAD_MAXIMA_INSERT = 8;

/** Resuelve un BLOCK (y sus INSERT anidados) a primitivas en coordenadas CAD nativas, relativas al punto base DEL PROPIO bloque — ver cabecera del archivo. */
function resolverBloque(
  nombre: string,
  blocks: Record<string, IBlock>,
  capasNoReconocidas: Set<string>,
  entidadesNoSoportadas: Set<string>,
  pilaVisitados: string[],
): PrimitivaInterna[] {
  if (pilaVisitados.includes(nombre)) {
    throw new Error(`Referencia circular de INSERT: ${[...pilaVisitados, nombre].join(" → ")}.`);
  }
  if (pilaVisitados.length >= PROFUNDIDAD_MAXIMA_INSERT) {
    throw new Error(`Más de ${PROFUNDIDAD_MAXIMA_INSERT} niveles de INSERT anidados (bloque "${nombre}") — probable referencia circular.`);
  }
  const block = blocks[nombre];
  if (!block) throw new Error(`El bloque referenciado "${nombre}" no existe en el archivo.`);
  const base: Punto = block.position ?? { x: 0, y: 0 };
  const primitivas: PrimitivaInterna[] = [];
  for (const entity of block.entities) {
    if (entity.type === "INSERT") {
      const e = entity as IInsertEntity;
      const hijas = resolverBloque(e.name, blocks, capasNoReconocidas, entidadesNoSoportadas, [...pilaVisitados, nombre]);
      const rot = ((e.rotation ?? 0) * Math.PI) / 180;
      const sx = e.xScale ?? 1;
      const sy = e.yScale ?? 1;
      const posicionRelativa = restar(e.position, base);
      primitivas.push(...aplicarTransformInsert(hijas, rot, sx, sy, posicionRelativa.x, posicionRelativa.y));
    } else {
      primitivas.push(...convertirEntidad(entity, base, capasNoReconocidas, entidadesNoSoportadas));
    }
  }
  return primitivas;
}

function primitivaAComandos(p: PrimitivaInterna): DrawCommand[] {
  switch (p.tipo) {
    case "circulo":
      return [{ type: "circle", x: p.centro.x, y: p.centro.y, r: p.r, layer: p.layer }];
    case "elipseSinRotar":
      return [{ type: "ellipse", x: p.centro.x, y: p.centro.y, rx: p.rx, ry: p.ry, layer: p.layer }];
    case "texto":
      return [{ type: "text", x: p.posicion.x, y: p.posicion.y, text: p.texto, size: p.tamano, layer: p.layer }];
    case "polilinea": {
      if (p.cerrada && p.puntos.length === 4) {
        const rect = detectarRectanguloAxisAligned(p.puntos);
        if (rect) return [{ type: "rect", x: rect.x, y: rect.y, width: rect.width, height: rect.height, layer: p.layer, fill: p.rellena || undefined }];
      }
      const segmentos: DrawCommand[] = [];
      for (let i = 0; i < p.puntos.length - 1; i++) {
        segmentos.push({ type: "line", x1: p.puntos[i].x, y1: p.puntos[i].y, x2: p.puntos[i + 1].x, y2: p.puntos[i + 1].y, layer: p.layer });
      }
      if (p.cerrada && p.puntos.length > 1) {
        const ultimo = p.puntos[p.puntos.length - 1];
        const primero = p.puntos[0];
        segmentos.push({ type: "line", x1: ultimo.x, y1: ultimo.y, x2: primero.x, y2: primero.y, layer: p.layer });
      }
      return segmentos;
    }
  }
}

function bboxDeComandos(commands: DrawCommand[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const marcar = (x: number, y: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const c of commands) {
    switch (c.type) {
      case "line":
        marcar(c.x1, c.y1);
        marcar(c.x2, c.y2);
        break;
      case "rect":
        marcar(c.x, c.y);
        marcar(c.x + c.width, c.y + c.height);
        break;
      case "circle":
        marcar(c.x - c.r, c.y - c.r);
        marcar(c.x + c.r, c.y + c.r);
        break;
      case "ellipse":
        marcar(c.x - c.rx, c.y - c.ry);
        marcar(c.x + c.rx, c.y + c.ry);
        break;
      case "text":
        marcar(c.x, c.y);
        break;
      case "simbolo":
        marcar(c.x, c.y);
        break;
    }
  }
  return { minX, maxX, minY, maxY };
}

export interface ResultadoImportacionDxf {
  bloques: BloqueDetectado[];
  fallidos: BloqueFallido[];
}

/** Punto de entrada — lee el texto de un DXF y devuelve cada BLOCK nombrado convertido a un símbolo listo para previsualizar/guardar. */
export function extraerBloquesDesdeDxf(dxfTexto: string): ResultadoImportacionDxf {
  const parser = new DxfParser();
  const dxf: IDxf | null = parser.parseSync(dxfTexto);
  if (!dxf) throw new Error("No se pudo leer el archivo — ¿es un DXF válido?");
  const blocks = dxf.blocks ?? {};
  const nombresReales = Object.keys(blocks).filter((n) => !esBloqueInterno(n));

  const bloques: BloqueDetectado[] = [];
  const fallidos: BloqueFallido[] = [];

  for (const nombre of nombresReales) {
    try {
      const capasNoReconocidas = new Set<string>();
      const entidadesNoSoportadas = new Set<string>();
      const primitivasCad = resolverBloque(nombre, blocks, capasNoReconocidas, entidadesNoSoportadas, []);
      const primitivasPagina = transformarPrimitivas(primitivasCad, (p) => ({ x: p.x, y: -p.y }));
      const comandosBrutos = primitivasPagina.flatMap(primitivaAComandos);
      if (comandosBrutos.length === 0) {
        fallidos.push({ nombre, error: "El bloque no tiene geometría soportada (o está vacío)." });
        continue;
      }
      const bbox = bboxDeComandos(comandosBrutos);
      const cx = (bbox.minX + bbox.maxX) / 2;
      const yTop = bbox.minY;
      const comandosFinales = trasladarXY(comandosBrutos, -cx, -yTop);
      bloques.push({
        nombre,
        descripcionSugerida: `Símbolo "${nombre}" (bloque DXF).`,
        commands: comandosFinales,
        ancho: bbox.maxX - bbox.minX,
        alto: bbox.maxY - bbox.minY,
        capasNoReconocidas: [...capasNoReconocidas],
        entidadesNoSoportadas: [...entidadesNoSoportadas],
      });
    } catch (err) {
      fallidos.push({ nombre, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { bloques, fallidos };
}
