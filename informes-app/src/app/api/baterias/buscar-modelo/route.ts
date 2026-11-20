import { NextRequest, NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { claudeDisponible, mensajeErrorIa, MENSAJE_SOLO_CLAUDE } from "@/lib/ai/motor";
import { verificarLimiteIa } from "@/lib/ai/rate-limit";
import { registrarUsoIa } from "@/lib/ai/registrar-uso";
import { buscarDatosModeloEnInternet } from "@/lib/baterias/buscar-modelo";
import { rolBateria } from "@/lib/baterias/types";
import { buscarDatosPrevios } from "@/lib/baterias/previos";
import { CATEGORIA_EQUIPO_LABEL as LABEL_EQUIPO } from "@/components/equipos/types";
import { CATEGORIA_EQUIPO_LABEL as LABEL_RACK } from "@/components/racks/types";
import type { EquipoCategoria, RackCategoriaEquipo } from "@/lib/database.types";

// La búsqueda web corre del lado de Anthropic y puede tardar bastante más que leer una foto.
export const maxDuration = 60;

/**
 * "Buscar en internet" las baterías de un modelo de UPS / banco / rectificador
 * (cuántas lleva, de qué tipo, qué potencia). A pedido del técnico, no en cada
 * lectura de foto: usa la búsqueda web de Claude, que no tienen las IAs
 * gratuitas, y cuesta más que una lectura común.
 */
export async function POST(req: NextRequest) {
  const profile = await requireProfile();
  const supabase = await createClient();

  let body: { categoria?: unknown; marcaModelo?: unknown; soloInternet?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
  }
  const categoria = typeof body.categoria === "string" ? body.categoria : "";
  const marcaModelo = typeof body.marcaModelo === "string" ? body.marcaModelo.trim().slice(0, 120) : "";
  if (!rolBateria(categoria)) return NextResponse.json({ error: "Este equipo no lleva datos de baterías." }, { status: 400 });
  if (!marcaModelo) return NextResponse.json({ error: "Cargá primero la marca/modelo del equipo." }, { status: 400 });

  // Primero lo que ya se cargó de ese mismo modelo: es gratis y no gasta IA. "soloInternet" lo saltea.
  if (body.soloInternet !== true) {
    const previos = await buscarDatosPrevios(supabase, categoria, marcaModelo);
    if (previos) {
      return NextResponse.json({
        origen: "previos",
        datos: {
          bateriaCantidad: previos.bateriaCantidad,
          bateriaTipo: previos.bateriaTipo,
          upsBaterias: previos.upsBaterias,
          potenciaNominal: previos.potenciaNominal,
          fuenteUrl: null,
          nota: `Se usaron los datos de otro equipo del mismo modelo ya cargado (“${previos.deEquipo}”) — verificá que coincidan con este.`,
        },
      });
    }
  }

  if (!(await claudeDisponible(supabase))) return NextResponse.json({ error: MENSAJE_SOLO_CLAUDE }, { status: 503 });

  const limite = await verificarLimiteIa(supabase, profile.id);
  if (!limite.permitido) return NextResponse.json({ error: limite.error }, { status: 429 });

  const categoriaLabel = (LABEL_EQUIPO as Record<string, string>)[categoria as EquipoCategoria] ?? (LABEL_RACK as Record<string, string>)[categoria as RackCategoriaEquipo] ?? categoria;

  try {
    const r = await buscarDatosModeloEnInternet(categoriaLabel, marcaModelo);
    await registrarUsoIa(supabase, {
      endpoint: "baterias/buscar-modelo",
      modulo: "equipos",
      modelo: r.modelo,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      userId: profile.id,
    });
    return NextResponse.json({ origen: "internet", datos: r.datos });
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    if (/no devolvió una respuesta reconocible|tardó demasiado/.test(detalle)) {
      return NextResponse.json({ error: detalle }, { status: 502 });
    }
    return NextResponse.json({ error: mensajeErrorIa(err) }, { status: 502 });
  }
}
