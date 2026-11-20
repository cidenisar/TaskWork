import { NextRequest, NextResponse } from "next/server";
import { ejecutarLiberacionAutomatica } from "@/lib/storage/liberacion-automatica";

/**
 * Lo llama Vercel Cron (ver vercel.json) una vez por día. Protegido con
 * CRON_SECRET: sin esa env var configurada, se rechaza todo pedido (fail
 * closed) en vez de correr sin protección.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Falta CRON_SECRET en las variables de entorno." }, { status: 500 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const resultado = await ejecutarLiberacionAutomatica();
  return NextResponse.json(resultado);
}
