/**
 * Reglas de las tareas pendientes, puras y sin base de datos: de qué líneas
 * sale cada tarea, qué hay que hacer en la tabla cuando se guarda o edita un
 * informe, y cómo se agrupan por región → provincia → localidad → sitio.
 * Las usan `sincronizar.ts` (escribe en la base) y Panel → Tareas pendientes.
 */
import type { EstadoTarea, MotivoCierreTarea } from "@/lib/database.types";

export const MOTIVO_CIERRE_LABEL: Record<MotivoCierreTarea, string> = {
  resuelta_en_visita: "Resuelta en una visita",
  resuelta_aparte: "Resuelta",
  equipo_dado_de_baja: "Se dio de baja el equipo",
  ya_no_aplica: "Ya no aplica",
  duplicada: "Estaba repetida",
};

export const SIN_LOCALIDAD = "(sin localidad)";
/** Una tarea abierta hace más de esto se marca como "vieja" en el Panel. */
export const DIAS_TAREA_VIEJA = 30;

/** Dos líneas son "la misma tarea" si solo difieren en mayúsculas o espacios. */
export function normalizarTarea(texto: string): string {
  return texto.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Las tareas de un informe: una por línea del campo de texto, sin viñetas ni
 * numeración (el PDF ya las numera), sin vacías y sin repetidas. Una viñeta
 * solo se saca si va seguida de un espacio: "10.5 kV" y "-5 dB" quedan tal cual.
 */
export function lineasDeTareas(texto: string | null | undefined): string[] {
  const vistas = new Set<string>();
  const lineas: string[] = [];
  for (const cruda of (texto ?? "").split(/\r?\n/)) {
    const linea = cruda
      .replace(/^\s*(?:[-*•·]+|\d+[.)])\s+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!linea || /^[-*•·]+$/.test(linea)) continue; // vacía, o una viñeta suelta sin texto
    const clave = normalizarTarea(linea);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    lineas.push(linea);
  }
  return lineas;
}

export interface TareaExistente {
  id: string;
  texto: string;
  estado: EstadoTarea;
  ubicacionId: string;
}

export interface PlanSincronizacion {
  /** Líneas nuevas: hay que crear una tarea por cada una. */
  insertar: string[];
  /** Tareas ABIERTAS que ya no están en el texto del informe: se borran. */
  borrarIds: string[];
  /** Tareas abiertas que siguen, pero el informe cambió de ubicación: se mudan. */
  moverIds: string[];
}

/**
 * Qué hacer en la tabla cuando se guarda un informe, comparando sus líneas con
 * las tareas que ya salieron de él. Lo que ya se cerró (resuelta o dada de baja)
 * NUNCA se toca ni se vuelve a crear, aunque la línea siga en el texto o la
 * hayan sacado: cerrar es una decisión de la oficina y no se pisa desde el informe.
 */
export function planSincronizacion(lineas: string[], existentes: TareaExistente[], ubicacionId: string): PlanSincronizacion {
  const clavesExistentes = new Set(existentes.map((e) => normalizarTarea(e.texto)));
  const clavesLineas = new Set(lineas.map(normalizarTarea));

  const insertar = lineas.filter((l) => !clavesExistentes.has(normalizarTarea(l)));
  const borrarIds: string[] = [];
  const moverIds: string[] = [];
  for (const e of existentes) {
    if (e.estado !== "abierta") continue;
    if (!clavesLineas.has(normalizarTarea(e.texto))) borrarIds.push(e.id);
    else if (e.ubicacionId !== ubicacionId) moverIds.push(e.id);
  }
  return { insertar, borrarIds, moverIds };
}

// ---------------------------------------------------------------------------
// Árbol región → provincia → localidad → sitio
// ---------------------------------------------------------------------------

export interface RutaTareas {
  region?: string;
  provincia?: string;
  localidad?: string;
  sitio?: string;
}

export interface TareaParaArbol {
  estado: EstadoTarea;
  created_at: string;
  region: string;
  provincia: string;
  localidad: string | null;
  sitio: string;
}

export type NivelArbol = "region" | "provincia" | "localidad" | "sitio";
const NIVELES: NivelArbol[] = ["region", "provincia", "localidad", "sitio"];

export interface NodoArbol {
  nivel: NivelArbol;
  nombre: string;
  ruta: RutaTareas;
  abiertas: number;
  /** Abiertas hace más de DIAS_TAREA_VIEJA días. */
  viejas: number;
  hijos: NodoArbol[];
}

export function diasDesde(iso: string, ahora: Date): number {
  return Math.max(0, Math.floor((ahora.getTime() - new Date(iso).getTime()) / 86_400_000));
}

interface Acumulado {
  nivel: NivelArbol;
  nombre: string;
  ruta: RutaTareas;
  abiertas: number;
  viejas: number;
  hijos: Map<string, Acumulado>;
}

function aNodos(mapa: Map<string, Acumulado>): NodoArbol[] {
  return [...mapa.values()]
    .sort((a, b) => b.abiertas - a.abiertas || a.nombre.localeCompare(b.nombre, "es"))
    .map((n) => ({ nivel: n.nivel, nombre: n.nombre, ruta: n.ruta, abiertas: n.abiertas, viejas: n.viejas, hijos: aNodos(n.hijos) }));
}

/** Cuenta las tareas ABIERTAS en cada nivel. Las cerradas no entran: el árbol es "lo que falta hacer". */
export function armarArbol(tareas: TareaParaArbol[], ahora: Date): NodoArbol[] {
  const raiz = new Map<string, Acumulado>();
  for (const t of tareas) {
    if (t.estado !== "abierta") continue;
    const vieja = diasDesde(t.created_at, ahora) > DIAS_TAREA_VIEJA;
    const valores = [t.region, t.provincia, t.localidad ?? SIN_LOCALIDAD, t.sitio];
    let nivelActual = raiz;
    let ruta: RutaTareas = {};
    NIVELES.forEach((nivel, i) => {
      const nombre = valores[i];
      ruta = { ...ruta, [nivel]: nombre };
      let nodo = nivelActual.get(nombre);
      if (!nodo) {
        nodo = { nivel, nombre, ruta, abiertas: 0, viejas: 0, hijos: new Map() };
        nivelActual.set(nombre, nodo);
      }
      nodo.abiertas += 1;
      if (vieja) nodo.viejas += 1;
      nivelActual = nodo.hijos;
    });
  }
  return aNodos(raiz);
}

/** ¿La tarea cae dentro de la rama elegida? Una ruta vacía las incluye a todas. */
export function coincideConRuta(t: Pick<TareaParaArbol, "region" | "provincia" | "localidad" | "sitio">, ruta: RutaTareas): boolean {
  if (ruta.region !== undefined && t.region !== ruta.region) return false;
  if (ruta.provincia !== undefined && t.provincia !== ruta.provincia) return false;
  if (ruta.localidad !== undefined && (t.localidad ?? SIN_LOCALIDAD) !== ruta.localidad) return false;
  if (ruta.sitio !== undefined && t.sitio !== ruta.sitio) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Resumen por localidad (hoja extra del Excel y mail semanal)
// ---------------------------------------------------------------------------

export interface TareaParaResumen extends TareaParaArbol {
  ubicacionId: string;
}

export interface ResumenLocalidad {
  region: string;
  provincia: string;
  localidad: string;
  sitios: number;
  abiertas: number;
  viejas: number;
  /** Días de la tarea abierta más antigua. */
  masAntiguaDias: number;
}

/** Una fila por región + provincia + localidad con tareas ABIERTAS, de más a menos pendientes. */
export function resumenPorLocalidad(tareas: TareaParaResumen[], ahora: Date): ResumenLocalidad[] {
  const mapa = new Map<string, ResumenLocalidad & { _sitios: Set<string> }>();
  for (const t of tareas) {
    if (t.estado !== "abierta") continue;
    const localidad = t.localidad ?? SIN_LOCALIDAD;
    const clave = [t.region, t.provincia, localidad].join("|");
    const dias = diasDesde(t.created_at, ahora);
    let r = mapa.get(clave);
    if (!r) {
      r = { region: t.region, provincia: t.provincia, localidad, sitios: 0, abiertas: 0, viejas: 0, masAntiguaDias: 0, _sitios: new Set() };
      mapa.set(clave, r);
    }
    r.abiertas += 1;
    if (dias > DIAS_TAREA_VIEJA) r.viejas += 1;
    r.masAntiguaDias = Math.max(r.masAntiguaDias, dias);
    r._sitios.add(t.ubicacionId);
  }
  return [...mapa.values()]
    .map(({ _sitios, ...r }) => ({ ...r, sitios: _sitios.size }))
    .sort((a, b) => b.abiertas - a.abiertas || a.region.localeCompare(b.region, "es") || a.localidad.localeCompare(b.localidad, "es"));
}

/** El texto con una viñeta ("• ") al inicio de cada línea — cómo se escribe y se guarda el campo del informe. */
export function conVinetas(lineas: string[]): string {
  return lineas.map((l) => `• ${l}`).join("\n");
}

/**
 * Comportamiento de lista al escribir en el campo de tareas: cada Enter abre una línea nueva con
 * viñeta, y un Enter sobre una viñeta vacía la quita y sale de la lista. Recibe el texto anterior,
 * el nuevo y dónde quedó el cursor; devuelve el texto final y la nueva posición del cursor.
 */
export function aplicarVinetas(anterior: string, nuevo: string, cursor: number): { texto: string; cursor: number } {
  const insertoSalto = nuevo.length === anterior.length + 1 && nuevo[cursor - 1] === "\n";
  if (!insertoSalto) return { texto: nuevo, cursor };
  const antes = nuevo.slice(0, cursor - 1);
  const despues = nuevo.slice(cursor);
  const inicioLinea = antes.lastIndexOf("\n") + 1;
  const lineaPrevia = antes.slice(inicioLinea);
  if (/^•\s*$/.test(lineaPrevia)) {
    // Enter sobre una viñeta vacía: se saca la viñeta y no se abre otra.
    const texto = antes.slice(0, inicioLinea) + despues;
    return { texto, cursor: inicioLinea };
  }
  const texto = `${antes}\n• ${despues}`;
  return { texto, cursor: antes.length + 3 };
}

export interface GrupoSitio<T> {
  ubicacionId: string;
  tareas: T[];
}

/** Agrupa tareas por sitio. Dentro de cada grupo, la más vieja primero; los grupos, por su tarea más vieja (lo más urgente arriba). */
export function agruparPorSitio<T extends { ubicacionId: string; created_at: string }>(tareas: T[]): GrupoSitio<T>[] {
  const mapa = new Map<string, T[]>();
  for (const t of tareas) mapa.set(t.ubicacionId, [...(mapa.get(t.ubicacionId) ?? []), t]);
  return [...mapa.entries()]
    .map(([ubicacionId, ts]) => ({ ubicacionId, tareas: [...ts].sort((a, b) => a.created_at.localeCompare(b.created_at)) }))
    .sort((a, b) => a.tareas[0].created_at.localeCompare(b.tareas[0].created_at));
}
