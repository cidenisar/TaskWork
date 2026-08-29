// Capa de datos de "Panorama de Sitios" — ver Cowork "Panorama de
// Sitios". Reusa getEventoActivo/getContadores de lib/accountability.ts
// y listarConsolas de lib/consolas.ts — es literalmente la misma
// pregunta ("¿este sitio tiene un evento en curso, y cómo va?") hecha
// para todos los sitios de la organización a la vez en vez de uno solo.

import { supabase } from "./supabase";
import { getEventoActivo, getContadores, type Totales } from "./accountability";
import { listarConsolas } from "./consolas";

export interface SitioPanorama {
  id: string;
  nombre: string;
  eventoActivo: { tipoNombre: string; modo: "real" | "simulacro"; iniciadoAt: string; totales: Totales } | null;
  consolasOnline: number;
  consolasTotal: number;
}

export async function listarPanorama(organizacionId: string): Promise<SitioPanorama[]> {
  const { data: sitios, error } = await supabase.from("sitios").select("id, nombre").eq("organizacion_id", organizacionId).order("nombre");
  if (error) throw error;

  return Promise.all(
    (sitios ?? []).map(async (s): Promise<SitioPanorama> => {
      const sitioId = s.id as string;
      const [evento, consolas] = await Promise.all([getEventoActivo(sitioId), listarConsolas(sitioId)]);
      let eventoActivo: SitioPanorama["eventoActivo"] = null;
      if (evento) {
        const { totales } = await getContadores(evento.id, sitioId);
        eventoActivo = { tipoNombre: evento.tipoNombre, modo: evento.modo, iniciadoAt: evento.iniciadoAt, totales };
      }
      return {
        id: sitioId,
        nombre: s.nombre as string,
        eventoActivo,
        consolasOnline: consolas.filter((c) => c.enLinea).length,
        consolasTotal: consolas.length,
      };
    })
  );
}
