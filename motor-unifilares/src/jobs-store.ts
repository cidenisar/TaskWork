/**
 * Cola de pedidos de generación (tabla motor_unifilares_jobs, ver
 * README.md "Generación asincrónica") — POST /api/unifilar solo encola acá
 * (encolarJob); scripts/procesar-cola.ts es el único que lee/marca el resto.
 */
import { clienteSupabase } from "./supabase-client.js";
import type { EstadoJobUnifilar, JobUnifilar, PedidoUnifilar } from "./types.js";

interface FilaJob {
  id: string;
  medicion_id: string;
  circuitos: JobUnifilar["circuitos"];
  rotulo: JobUnifilar["rotulo"];
}

export async function encolarJob(pedido: PedidoUnifilar): Promise<string> {
  const { data, error } = await clienteSupabase()
    .from("motor_unifilares_jobs")
    .insert({ medicion_id: pedido.medicionId, circuitos: pedido.circuitos, rotulo: pedido.rotulo })
    .select("id")
    .single();
  if (error) throw new Error(`No se pudo encolar el pedido: ${error.message}`);
  return (data as { id: string }).id;
}

export async function listarJobsPendientes(): Promise<JobUnifilar[]> {
  const { data, error } = await clienteSupabase()
    .from("motor_unifilares_jobs")
    .select("id, medicion_id, circuitos, rotulo")
    .eq("estado", "pendiente")
    .order("creado_en");
  if (error) throw new Error(`No se pudieron leer los pedidos pendientes: ${error.message}`);
  return (data as FilaJob[] | null ?? []).map((f) => ({ id: f.id, medicionId: f.medicion_id, circuitos: f.circuitos, rotulo: f.rotulo }));
}

async function marcarEstado(jobId: string, estado: EstadoJobUnifilar, errorDetalle?: string): Promise<void> {
  const { error } = await clienteSupabase()
    .from("motor_unifilares_jobs")
    .update({ estado, error_detalle: errorDetalle ?? null, actualizado_en: new Date().toISOString() })
    .eq("id", jobId);
  if (error) throw new Error(`No se pudo actualizar el pedido "${jobId}": ${error.message}`);
}

export const marcarGenerando = (jobId: string): Promise<void> => marcarEstado(jobId, "generando");
export const marcarListo = (jobId: string): Promise<void> => marcarEstado(jobId, "listo");
export const marcarError = (jobId: string, detalle: string): Promise<void> => marcarEstado(jobId, "error", detalle);
