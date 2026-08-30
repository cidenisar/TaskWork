// Capa de datos de Configuración de la organización — hoy un único
// toggle (SMS habilitado/deshabilitado), pensado para crecer con más
// configuración de organización a futuro (ver ROADMAP.md).
//
// Igual que Puntos/Códigos de acceso: escritura directa contra Supabase,
// `org_isolation` en `organizaciones` ya le permite a un admin leer/
// escribir SU PROPIA fila de organización (qual: id = organizacion del
// admin logueado) — no hace falta un endpoint de backend-server para
// esto. Ver backend-server/src/lib/db.ts, getSmsHabilitado (mismo campo,
// leído del lado del backend con la service_role key al despachar).

import { supabase } from "./supabase";

export interface Organizacion {
  id: string;
  nombre: string;
  smsHabilitado: boolean;
  /** Ver backend-server/README.md, "Autoregistro: código de organización" — null = autoregistro deshabilitado en Mobile todavía (nadie configuró uno). */
  codigoAccesoApp: string | null;
}

export async function getOrganizacion(organizacionId: string): Promise<Organizacion> {
  const { data, error } = await supabase
    .from("organizaciones")
    .select("id, nombre, sms_habilitado, codigo_acceso_app")
    .eq("id", organizacionId)
    .single();
  if (error) throw error;
  return {
    id: data.id as string,
    nombre: data.nombre as string,
    smsHabilitado: data.sms_habilitado as boolean,
    codigoAccesoApp: data.codigo_acceso_app as string | null,
  };
}

export async function setSmsHabilitado(organizacionId: string, habilitado: boolean): Promise<void> {
  const { error } = await supabase.from("organizaciones").update({ sms_habilitado: habilitado }).eq("id", organizacionId);
  if (error) throw error;
}

/**
 * `codigo` normalizado igual que del lado del backend
 * (`validarResolverCodigoOrg`) — mayúsculas, sin espacios — así lo que
 * se ve acá es exactamente lo que Mobile va a aceptar. `null` para
 * deshabilitar el autoregistro (deja el código sin configurar).
 */
export async function setCodigoAccesoApp(organizacionId: string, codigo: string | null): Promise<void> {
  const normalizado = codigo && codigo.trim() ? codigo.trim().toUpperCase() : null;
  const { error } = await supabase.from("organizaciones").update({ codigo_acceso_app: normalizado }).eq("id", organizacionId);
  if (error) {
    // 23505 = choque de índice único — otra organización ya tiene ese código (mismo criterio que lib/personas.ts con el DNI duplicado).
    if (error.code === "23505") throw new Error(`El código "${normalizado}" ya lo está usando otra organización — elegí uno distinto.`);
    throw error;
  }
}
