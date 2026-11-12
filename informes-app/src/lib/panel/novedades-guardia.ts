import type { createClient } from "@/lib/supabase/server";
import { horaGuardiaIso } from "@/lib/guardia/reloj";
import type { EstadoEventoGuardia, TipoAlarmaGuardia } from "@/lib/database.types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Tope de novedades en el resumen de Vista General — es un vistazo del día, no el detalle completo de cada evento. */
const MAX_NOVEDADES = 20;

export interface PanelNovedadGuardia {
  id: string;
  at: string;
  texto: string;
  eventoId: string;
  eventoNumero: number;
  tipoAlarma: TipoAlarmaGuardia;
  sitio: string;
  estadoEvento: EstadoEventoGuardia;
}

/**
 * Novedades de Guardia General (las cuatro áreas) creadas HOY — calendario,
 * no "día de guardia" (ese arranca miércoles a las 10:00, es otro concepto,
 * ver CLAUDE.md). RLS (guardia_novedad_select/guardia_evento_select) ya
 * limita esto solo a lo propio para un técnico — acá no hace falta
 * replicar ese filtro, Admin/Supervisor ya ven todo por `is_admin_or_supervisor()`.
 */
export async function getNovedadesGuardiaHoy(supabase: Supabase): Promise<PanelNovedadGuardia[]> {
  const hoy = horaGuardiaIso().slice(0, 10);
  const { data: novedadesRaw } = await supabase
    .from("guardia_novedad")
    .select("id, evento_id, at, texto")
    .gte("at", `${hoy}T00:00:00-03:00`)
    .order("at", { ascending: false })
    .limit(MAX_NOVEDADES);
  if (!novedadesRaw || novedadesRaw.length === 0) return [];

  const eventoIds = [...new Set(novedadesRaw.map((n) => n.evento_id))];
  const { data: eventosRaw } = await supabase
    .from("guardia_evento")
    .select("id, numero, tipo_alarma, sitio, estado")
    .in("id", eventoIds);
  const eventoPorId = new Map((eventosRaw ?? []).map((e) => [e.id, e]));

  return novedadesRaw.flatMap((n) => {
    const evento = eventoPorId.get(n.evento_id);
    if (!evento) return [];
    return [
      {
        id: n.id,
        at: n.at,
        texto: n.texto,
        eventoId: evento.id,
        eventoNumero: evento.numero,
        tipoAlarma: evento.tipo_alarma,
        sitio: evento.sitio,
        estadoEvento: evento.estado,
      },
    ];
  });
}
