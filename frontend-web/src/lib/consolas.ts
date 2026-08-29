import { supabase } from "./supabase";

export interface ConsolaEstado {
  id: string;
  nombre: string;
  enLinea: boolean;
  ultimoHeartbeat: string | null;
}

/**
 * Solo `nombre`/`en_linea`/`ultimo_heartbeat` — batería, camino de red y
 * firmware (que sí muestra el wireframe) no se sincronizan a Supabase
 * hoy, viven solo en la Pi/ESP32. Ver ROADMAP.md.
 */
export async function listarConsolas(sitioId: string): Promise<ConsolaEstado[]> {
  const { data, error } = await supabase.from("consolas").select("id, nombre, en_linea, ultimo_heartbeat").eq("sitio_id", sitioId).order("nombre");
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id as string,
    nombre: c.nombre as string,
    enLinea: c.en_linea as boolean,
    ultimoHeartbeat: c.ultimo_heartbeat as string | null,
  }));
}
