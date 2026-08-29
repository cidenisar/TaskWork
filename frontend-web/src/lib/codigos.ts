// Capa de datos de "Códigos de acceso" — ver Cowork "Administración de
// Padrón de Personas" (pestaña "Códigos de acceso") y
// backend-server/README.md ("Autoregistro de personas (Mobile)") para
// el consumo real (`POST /personas/canjear-codigo`).
//
// A diferencia de lo que decía ROADMAP.md ("acá sí falta backend"),
// generar y revocar un código NO necesita `service_role` — no hay PIN
// que hashear ni email que invitar, `org_isolation` (`FOR ALL`) ya le
// permite a un admin escribir en `codigos_acceso` directo. Es
// escritura directa contra Supabase, igual que editar/dar de baja un
// operador.

import { supabase } from "./supabase";

export type TipoCodigo = "individual" | "lote";
export type EstadoCodigo = "vigente" | "vencido" | "agotado" | "revocado";

export interface CodigoAcceso {
  id: string;
  codigo: string;
  tipo: TipoCodigo;
  dni: string | null;
  empresa: string;
  sitioId: string;
  sitioNombre: string;
  vencimiento: string;
  topeUsos: number;
  usosActuales: number;
  estado: EstadoCodigo;
}

export async function listarCodigos(organizacionId: string): Promise<CodigoAcceso[]> {
  const { data, error } = await supabase
    .from("codigos_acceso")
    .select("id, codigo, tipo, dni, empresa, sitio_id, vencimiento, tope_usos, usos_actuales, estado, sitios(nombre), created_at")
    .eq("organizacion_id", organizacionId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((c) => {
    const sitio = c.sitios as unknown as { nombre: string } | { nombre: string }[] | null;
    const sitioNombre = Array.isArray(sitio) ? (sitio[0]?.nombre ?? "—") : (sitio?.nombre ?? "—");
    return {
      id: c.id as string,
      codigo: c.codigo as string,
      tipo: c.tipo as TipoCodigo,
      dni: c.dni as string | null,
      empresa: c.empresa as string,
      sitioId: c.sitio_id as string,
      sitioNombre,
      vencimiento: c.vencimiento as string,
      topeUsos: c.tope_usos as number,
      usosActuales: c.usos_actuales as number,
      estado: c.estado as EstadoCodigo,
    };
  });
}

/**
 * `EMPRESA-XXXX` (3 letras + 4 hex mayúsculas) — mismo formato que
 * Cowork "Administración de Padrón de Personas", pero con
 * `crypto.getRandomValues` en vez de `Math.random()` — es un código
 * que le da a cualquiera con quien se comparta acceso real para
 * autoregistrarse y empezar a recibir alertas, mismo criterio que el
 * PIN de operadores (nunca `Math.random` para algo así).
 */
function generarCodigo(empresa: string): string {
  const prefijo = (empresa.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 3).toUpperCase() || "XXX").padEnd(3, "X");
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  const sufijo = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `${prefijo}-${sufijo}`;
}

export interface DatosCodigoForm {
  tipo: TipoCodigo;
  dni: string | null;
  empresa: string;
  sitioId: string;
  vencimiento: string;
  topeUsos: number;
}

const MAX_INTENTOS_CODIGO_UNICO = 5;

/**
 * Reintenta con un código nuevo si choca con el índice único
 * `(organizacion_id, codigo)` — improbable con 2^16 combinaciones por
 * prefijo, pero real, no algo para ignorar en silencio.
 */
export async function crearCodigo(organizacionId: string, generadoPor: string, datos: DatosCodigoForm): Promise<{ id: string; codigo: string }> {
  for (let intento = 0; intento < MAX_INTENTOS_CODIGO_UNICO; intento++) {
    const codigo = generarCodigo(datos.empresa);
    const { data, error } = await supabase
      .from("codigos_acceso")
      .insert({
        organizacion_id: organizacionId,
        codigo,
        tipo: datos.tipo,
        dni: datos.tipo === "individual" ? datos.dni : null,
        empresa: datos.empresa,
        sitio_id: datos.sitioId,
        vencimiento: datos.vencimiento,
        tope_usos: datos.tipo === "individual" ? 1 : datos.topeUsos,
        usos_actuales: 0,
        estado: "vigente",
        generado_por: generadoPor,
      })
      .select("id, codigo")
      .single();
    if (!error) return { id: data.id as string, codigo: data.codigo as string };
    if (error.code !== "23505") throw error; // no es choque de índice único — error real, no reintentar
  }
  throw new Error("No se pudo generar un código único después de varios intentos — probá de nuevo.");
}

export async function revocarCodigo(id: string): Promise<void> {
  const { error } = await supabase.from("codigos_acceso").update({ estado: "revocado" }).eq("id", id);
  if (error) throw error;
}
