import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { intentarEnviar } from "@/lib/guardia/notificar";

const MAX_INTENTOS = 5;
/** Más viejo que esto ya no importa reintentarlo — si en 3 días nadie se suscribió, seguir reintentando no cambia nada. */
const DIAS_MAXIMOS = 3;

/**
 * Red de seguridad del outbox (HANDOFF §9: "reintentos... que una falla
 * de envío no frene la operación"). El envío normal ya se intenta de
 * inmediato desde `notificar()` — esto solo reintenta lo que quedó
 * `fallida` o `pendiente` (no debería haber `pendiente` viejas, pero por
 * si el proceso se cortó a mitad de camino).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Falta CRON_SECRET en las variables de entorno." }, { status: 500 });
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const service = createServiceRoleClient();
  const desde = new Date(Date.now() - DIAS_MAXIMOS * 24 * 60 * 60 * 1000).toISOString();

  const { data: pendientes } = await service
    .from("guardia_notificacion")
    .select("id, usuario_id, payload, intentos")
    .in("estado", ["pendiente", "fallida"])
    .lt("intentos", MAX_INTENTOS)
    .gte("creada_at", desde);

  for (const fila of pendientes ?? []) {
    await intentarEnviar(service, fila.id, fila.usuario_id, fila.payload, fila.intentos);
  }

  return NextResponse.json({ reintentadas: pendientes?.length ?? 0 });
}
