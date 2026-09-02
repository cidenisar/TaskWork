// Capa de datos de Administración de Operadores — ver Cowork
// "Administración de Operadores" para el diseño, y
// backend-server/README.md ("Alta de operadores y login web para
// admins") para el contrato real.
//
// Alta y reseteo de PIN pasan por backend-server (necesitan
// service_role para hashear el PIN e invitar por email). Todo lo demás
// — listar, editar nombre/legajo/rol/alcance, dar de baja/reactivar —
// es escritura directa contra Supabase: no generan PIN ni tocan Auth,
// así que no necesitan pasar por el backend (`org_isolation` ya se lo
// permite a un admin, mismo criterio que documenta el backend README).
//
// Gap conocido (no resuelto acá, ver ROADMAP.md): no hay forma de
// invitar por email a un operador YA existente — `POST /operadores`
// solo invita en el momento de crearlo. Si se edita un operador para
// pasarlo a rol admin, esta pantalla no le da login web automáticamente.

import { supabase } from "./supabase";
import { llamarBackend } from "./backend";
import type { AlcanceTipo } from "./auth";

export type RolOperador = "operador" | "admin";
export type EstadoOperador = "activo" | "de_baja";

export interface OperadorFila {
  id: string;
  nombre: string;
  legajo: string | null;
  rol: RolOperador;
  alcanceTipo: AlcanceTipo;
  estado: EstadoOperador;
  sitios: { id: string; nombre: string }[];
}

export interface SitioOpcion {
  id: string;
  nombre: string;
}

export async function listarSitiosDeOrganizacion(organizacionId: string): Promise<SitioOpcion[]> {
  const { data, error } = await supabase.from("sitios").select("id, nombre").eq("organizacion_id", organizacionId).order("nombre");
  if (error) throw error;
  return (data ?? []).map((s) => ({ id: s.id as string, nombre: s.nombre as string }));
}

export async function listarOperadores(organizacionId: string): Promise<OperadorFila[]> {
  const { data: operadores, error } = await supabase
    .from("operadores")
    .select("id, nombre, legajo, rol, alcance_tipo, estado")
    .eq("organizacion_id", organizacionId)
    .order("nombre");
  if (error) throw error;
  if (!operadores || operadores.length === 0) return [];

  const idsConSitio = operadores.filter((o) => o.alcance_tipo === "sitio").map((o) => o.id as string);
  const sitiosPorOperador = new Map<string, { id: string; nombre: string }[]>();
  if (idsConSitio.length > 0) {
    const { data: vinculos, error: vErr } = await supabase
      .from("operadores_sitios")
      .select("operador_id, sitios(id, nombre)")
      .in("operador_id", idsConSitio);
    if (vErr) throw vErr;
    for (const v of vinculos ?? []) {
      const sitio = v.sitios as unknown as { id: string; nombre: string } | { id: string; nombre: string }[] | null;
      const s = Array.isArray(sitio) ? sitio[0] : sitio;
      if (!s) continue;
      const lista = sitiosPorOperador.get(v.operador_id as string) ?? [];
      lista.push(s);
      sitiosPorOperador.set(v.operador_id as string, lista);
    }
  }

  return operadores.map((o) => ({
    id: o.id as string,
    nombre: o.nombre as string,
    legajo: o.legajo as string | null,
    rol: o.rol as RolOperador,
    alcanceTipo: o.alcance_tipo as AlcanceTipo,
    estado: o.estado as EstadoOperador,
    sitios: sitiosPorOperador.get(o.id as string) ?? [],
  }));
}

export interface DatosOperadorForm {
  nombre: string;
  legajo: string | null;
  rol: RolOperador;
  alcanceTipo: AlcanceTipo;
  sitiosIds: string[];
  email: string | null;
}

export type ResultadoCrear = { ok: true; id: string; pin: string; invitado: boolean; errorInvitacion?: string } | { ok: false; error: string };

export async function crearOperador(datos: DatosOperadorForm): Promise<ResultadoCrear> {
  const r = await llamarBackend<{ id: string; pin: string; invitado: boolean; errorInvitacion?: string }>("/operadores", {
    method: "POST",
    body: { nombre: datos.nombre, legajo: datos.legajo, rol: datos.rol, alcanceTipo: datos.alcanceTipo, sitiosIds: datos.sitiosIds, email: datos.email },
  });
  if (r.status !== 201 || "error" in r.body) {
    return { ok: false, error: "error" in r.body ? r.body.error : "Error inesperado creando el operador." };
  }
  return { ok: true, id: r.body.id, pin: r.body.pin, invitado: r.body.invitado, errorInvitacion: r.body.errorInvitacion };
}

export type ResultadoResetearPin = { ok: true; pin: string } | { ok: false; error: string };

export async function resetearPin(operadorId: string): Promise<ResultadoResetearPin> {
  const r = await llamarBackend<{ pin: string }>(`/operadores/${operadorId}/resetear-pin`, { method: "POST" });
  if (r.status !== 200 || "error" in r.body) {
    return { ok: false, error: "error" in r.body ? r.body.error : "Error inesperado reseteando el PIN." };
  }
  return { ok: true, pin: r.body.pin };
}

/** Edición simple (nombre/legajo/rol/alcance) — escritura directa, ver comentario de arriba. */
export async function actualizarOperador(operadorId: string, datos: Omit<DatosOperadorForm, "email">): Promise<void> {
  const { error } = await supabase
    .from("operadores")
    .update({ nombre: datos.nombre, legajo: datos.legajo, rol: datos.rol, alcance_tipo: datos.alcanceTipo })
    .eq("id", operadorId);
  if (error) throw error;

  // Reemplazo completo del vínculo con sitios — más simple que diffear,
  // y el volumen (unos pocos sitios por operador) no lo justifica.
  const { error: delErr } = await supabase.from("operadores_sitios").delete().eq("operador_id", operadorId);
  if (delErr) throw delErr;
  if (datos.alcanceTipo === "sitio" && datos.sitiosIds.length > 0) {
    const { error: insErr } = await supabase.from("operadores_sitios").insert(datos.sitiosIds.map((sitioId) => ({ operador_id: operadorId, sitio_id: sitioId })));
    if (insErr) throw insErr;
  }
}

export async function cambiarEstadoOperador(operadorId: string, estado: EstadoOperador): Promise<void> {
  const { error } = await supabase.from("operadores").update({ estado }).eq("id", operadorId);
  if (error) throw error;
}
