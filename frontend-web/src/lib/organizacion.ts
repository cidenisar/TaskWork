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
}

export async function getOrganizacion(organizacionId: string): Promise<Organizacion> {
  const { data, error } = await supabase
    .from("organizaciones")
    .select("id, nombre, sms_habilitado")
    .eq("id", organizacionId)
    .single();
  if (error) throw error;
  return { id: data.id as string, nombre: data.nombre as string, smsHabilitado: data.sms_habilitado as boolean };
}

export async function setSmsHabilitado(organizacionId: string, habilitado: boolean): Promise<void> {
  const { error } = await supabase.from("organizaciones").update({ sms_habilitado: habilitado }).eq("id", organizacionId);
  if (error) throw error;
}
