import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { EstadoNotificacionGuardia, GuardiaNotificacionRow } from "@/lib/database.types";

const ORDEN: Record<EstadoNotificacionGuardia, number> = { pendiente: 0, enviada: 1, entregada: 2, leida: 3, fallida: -1 };

/**
 * Lo llama el service worker (`public/sw-push.js`), con la cookie de
 * sesión del navegador — nunca con el secreto de cron ni service role.
 * RLS (`guardia_notificacion_marcar`) ya exige `usuario_id = auth.uid()`,
 * esto solo evita retroceder el estado si los eventos llegan en otro
 * orden (ej. "leída" antes de que se procese "entregada").
 */
export async function POST(request: NextRequest) {
  const profile = await requireProfile();
  const body = await request.json().catch(() => null);
  const id = body?.id;
  const estado = body?.estado as EstadoNotificacionGuardia | undefined;
  if (typeof id !== "string" || (estado !== "entregada" && estado !== "leida")) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: actual } = await supabase.from("guardia_notificacion").select("id, usuario_id, estado").eq("id", id).maybeSingle();
  if (!actual || actual.usuario_id !== profile.id) return NextResponse.json({ ok: true }); // no es suya o no existe — no hay nada que confirmar, no es un error del cliente

  if (ORDEN[estado] <= ORDEN[actual.estado as EstadoNotificacionGuardia]) return NextResponse.json({ ok: true });

  const ahora = new Date().toISOString();
  const campoFecha = estado === "entregada" ? "entregada_at" : "leida_at";
  const update = { estado, [campoFecha]: ahora } as Partial<GuardiaNotificacionRow>;
  await supabase.from("guardia_notificacion").update(update).eq("id", id);

  return NextResponse.json({ ok: true });
}
