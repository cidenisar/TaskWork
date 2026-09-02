// Capa de datos de Administración de Puntos de Encuentro — ver Cowork
// "Administración de Puntos de Encuentro" para el diseño.
//
// Todo esto es escritura directa contra Supabase (`org_isolation` ya se
// lo permite a un admin para su organización — mismo criterio que
// Operadores/Códigos). No hay coordenadas/mapa en el wireframe: un
// punto de encuentro es solo nombre + descripción/ubicación en texto
// libre, ligado a un sitio.
//
// Alcance: a diferencia de Operadores (que lista TODOS los sitios de la
// organización para asignar), acá el selector de sitio usa
// `listarSitiosVisibles` (de lib/sitios.ts), ya filtrado por el
// `alcance_tipo` del admin logueado — igual que Panorama y el Selector
// de Sitio. `org_isolation` en `puntos_encuentro` solo verifica el
// límite de ORGANIZACIÓN (join contra `sitios.organizacion_id`), no
// distingue alcance de sitio puntual (mismo hallazgo que
// Accountability en vivo, ver README) — así que un admin de alcance
// "sitio" podría, en teoría, escribir puntos de un sitio ajeno de su
// misma organización si el sitio llegara desde otro lado que no sea
// este selector ya filtrado. Alcanza con nunca ofrecer esa opción en la
// UI (no hay forma de navegar acá con un sitioId por URL, a diferencia
// de Accountability).

import { supabase } from "./supabase";

export interface PuntoEncuentroFila {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

export async function listarPuntos(sitioId: string): Promise<PuntoEncuentroFila[]> {
  const { data, error } = await supabase
    .from("puntos_encuentro")
    .select("id, nombre, descripcion, activo")
    .eq("sitio_id", sitioId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id as string,
    nombre: p.nombre as string,
    descripcion: p.descripcion as string | null,
    activo: p.activo as boolean,
  }));
}

export async function crearPunto(sitioId: string, nombre: string, descripcion: string): Promise<void> {
  const { error } = await supabase.from("puntos_encuentro").insert({
    sitio_id: sitioId,
    nombre,
    descripcion: descripcion || null,
    activo: true,
  });
  if (error) throw error;
}

export async function actualizarPunto(id: string, nombre: string, descripcion: string): Promise<void> {
  const { error } = await supabase
    .from("puntos_encuentro")
    .update({ nombre, descripcion: descripcion || null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function cambiarEstadoPunto(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from("puntos_encuentro").update({ activo, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
