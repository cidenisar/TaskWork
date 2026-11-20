/**
 * Texto del mail de los lunes con el estado de las tareas pendientes. Puro (sin
 * base de datos ni mail) para poder probarlo: recibe las tareas ya cargadas.
 * Devuelve null si no hay ninguna abierta: ese lunes no se manda nada.
 */
import { diasDesde, DIAS_TAREA_VIEJA, resumenPorLocalidad, SIN_LOCALIDAD, type ResumenLocalidad } from "./puro";
import type { TareaPanel } from "./cargar";

const MAX_MAS_ANTIGUAS = 10;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function lugar(t: TareaPanel): string {
  return [t.localidad ?? SIN_LOCALIDAD, t.sitio, t.planta, t.oficina].filter(Boolean).join(" · ");
}

export function armarResumenSemanal(tareas: TareaPanel[], ahora: Date): { asunto: string; texto: string } | null {
  const abiertas = tareas.filter((t) => t.estado === "abierta");
  if (abiertas.length === 0) return null;

  const viejas = abiertas.filter((t) => diasDesde(t.created_at, ahora) > DIAS_TAREA_VIEJA).length;
  const sitios = new Set(abiertas.map((t) => t.ubicacionId)).size;
  const porLocalidad = resumenPorLocalidad(abiertas, ahora);

  // Región → sus localidades, regiones con más pendientes primero.
  const porRegion = new Map<string, ResumenLocalidad[]>();
  for (const l of porLocalidad) porRegion.set(l.region, [...(porRegion.get(l.region) ?? []), l]);
  const regiones = [...porRegion.entries()]
    .map(([region, locs]) => ({ region, locs, total: locs.reduce((n, l) => n + l.abiertas, 0) }))
    .sort((a, b) => b.total - a.total || a.region.localeCompare(b.region, "es"));

  const lineas: string[] = [];
  lineas.push(`Tareas pendientes abiertas: ${abiertas.length} en ${plural(sitios, "sitio", "sitios")}.`);
  lineas.push(viejas > 0 ? `Con más de ${DIAS_TAREA_VIEJA} días: ${viejas}.` : `Ninguna lleva más de ${DIAS_TAREA_VIEJA} días abierta.`);
  lineas.push("");
  lineas.push("POR REGIÓN Y LOCALIDAD");
  for (const r of regiones) {
    lineas.push(`${r.region}: ${r.total}`);
    for (const l of r.locs) {
      lineas.push(`  - ${l.localidad} (${l.provincia}): ${l.abiertas}${l.viejas > 0 ? ` — ${l.viejas} con más de ${DIAS_TAREA_VIEJA} días` : ""}`);
    }
  }
  lineas.push("");
  lineas.push(`LAS ${Math.min(MAX_MAS_ANTIGUAS, abiertas.length) === 1 ? "MÁS ANTIGUA" : `${Math.min(MAX_MAS_ANTIGUAS, abiertas.length)} MÁS ANTIGUAS`}`);
  const masAntiguas = [...abiertas].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, MAX_MAS_ANTIGUAS);
  for (const t of masAntiguas) lineas.push(`  - hace ${diasDesde(t.created_at, ahora)} d — ${t.texto} (${lugar(t)})`);
  lineas.push("");
  lineas.push("Se adjunta el plan de visita en Excel, ordenado por ubicación. Se gestionan en Panel → Tareas.");

  return {
    asunto: `Tareas pendientes — ${plural(abiertas.length, "abierta", "abiertas")}${viejas > 0 ? `, ${viejas} con más de ${DIAS_TAREA_VIEJA} días` : ""}`,
    texto: lineas.join("\n"),
  };
}
