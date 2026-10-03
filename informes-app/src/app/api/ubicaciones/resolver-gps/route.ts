import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { distanciaMetros } from "@/lib/geo";
import { labelUbicacion, type Ubicacion } from "@/components/ubicaciones/types";

/**
 * Dado un punto GPS, intenta ubicar al técnico sin que tenga que buscar a
 * mano entre miles de sitios:
 *
 * 1. Primero busca si el punto cae cerca (RADIO_MATCH_METROS) de una
 *    Ubicación que YA tiene coordenadas guardadas (porque alguien la
 *    confirmó antes) — si hay una, es el caso ideal: "aprendió" ese sitio y
 *    ya no hace falta geocoding ni elegir nada.
 * 2. Si no hay ninguna cerca, reverse-geocodea con Nominatim (OpenStreetMap,
 *    gratis, sin API key) para acotar Provincia/Localidad.
 * 3. La Localidad/Zona que devuelve Nominatim es un municipio/ciudad
 *    "de libro" que no necesariamente coincide con cómo está nombrada esa
 *    misma zona en nuestro catálogo (ej. "La Plata / Ensenada / Berisso"
 *    agrupa varios partidos) — se le pide a la IA que elija, de las
 *    localidades YA usadas en el catálogo para esa provincia, cuál
 *    corresponde, en vez de crear una variante nueva que fragmente el
 *    catálogo. Si no hay ninguna, no fuerza nada (localidad = la cruda).
 *
 * Nunca escribe nada en la base — solo devuelve sugerencias; quien llama
 * decide qué hacer y el técnico siempre confirma antes de guardar.
 */

const RADIO_MATCH_METROS = 300;

const ALIAS_PROVINCIA: Record<string, string> = {
  "ciudad autónoma de buenos aires": "CABA",
  "ciudad autonoma de buenos aires": "CABA",
};

function normalizarProvincia(nombreDetectado: string, catalogo: string[]): string | null {
  const limpio = nombreDetectado.trim().toLowerCase();
  const alias = ALIAS_PROVINCIA[limpio];
  if (alias && catalogo.includes(alias)) return alias;
  const exacto = catalogo.find((p) => p.toLowerCase() === limpio);
  if (exacto) return exacto;
  const parcial = catalogo.find((p) => limpio.includes(p.toLowerCase()) || p.toLowerCase().includes(limpio));
  return parcial ?? null;
}

export async function POST(req: NextRequest) {
  await requireProfile();
  const supabase = await createClient();

  const body = await req.json().catch(() => null);
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Faltan las coordenadas." }, { status: 400 });
  }

  // 1. ¿Hay una Ubicación ya geo-confirmada cerca?
  const { data: geoRows } = await supabase
    .from("ubicaciones")
    .select("id, pais, region, provincia, localidad, sitio, planta, oficina, lat, lng")
    .not("lat", "is", null);
  let mejorId: string | null = null;
  let mejorDistancia = Infinity;
  let mejorFila: Ubicacion | null = null;
  for (const u of geoRows ?? []) {
    if (u.lat === null || u.lng === null) continue;
    const d = distanciaMetros(lat, lng, u.lat, u.lng);
    if (d <= RADIO_MATCH_METROS && d < mejorDistancia) {
      mejorDistancia = d;
      mejorId = u.id;
      mejorFila = u;
    }
  }
  if (mejorId && mejorFila) {
    return NextResponse.json({
      tipo: "match",
      ubicacionId: mejorId,
      provincia: mejorFila.provincia,
      label: labelUbicacion(mejorFila),
      distanciaM: Math.round(mejorDistancia),
    });
  }

  // 2. Reverse geocoding con Nominatim (OpenStreetMap) — gratis, sin key.
  let provinciaDetectada: string | null = null;
  let localidadCruda: string | null = null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`,
      { headers: { "User-Agent": "InformesApp/1.0 (uso interno)" } },
    );
    if (res.ok) {
      const data = await res.json();
      const addr = data?.address ?? {};
      provinciaDetectada = typeof addr.state === "string" ? addr.state : null;
      localidadCruda =
        (typeof addr.city === "string" && addr.city) ||
        (typeof addr.town === "string" && addr.town) ||
        (typeof addr.village === "string" && addr.village) ||
        (typeof addr.county === "string" && addr.county) ||
        null;
    }
  } catch {
    // sin geocoding seguimos devolviendo "sin_datos" — las coordenadas
    // crudas igual se van a guardar en el flujo manual de todas formas.
  }

  if (!provinciaDetectada) {
    return NextResponse.json({ tipo: "sin_datos" });
  }

  const { data: provinciasData } = await supabase.from("catalogo_provincias").select("nombre");
  const provincia = normalizarProvincia(provinciaDetectada, (provinciasData ?? []).map((p) => p.nombre));
  if (!provincia) {
    return NextResponse.json({ tipo: "sin_datos" });
  }

  let localidad = localidadCruda;
  if (localidadCruda && process.env.ANTHROPIC_API_KEY) {
    const { data: localidadesData } = await supabase
      .from("ubicaciones")
      .select("localidad")
      .eq("provincia", provincia)
      .not("localidad", "is", null);
    const localidadesConocidas = [...new Set((localidadesData ?? []).map((u) => u.localidad).filter((l): l is string => !!l))];
    if (localidadesConocidas.length > 0) {
      try {
        const client = new Anthropic();
        const response = await client.messages.create({
          model: "claude-haiku-4-5",
          max_tokens: 60,
          system:
            "Elegís, de una lista de nombres de localidad/zona ya usados en un catálogo de sitios de una empresa, cuál corresponde a un " +
            "municipio detectado por GPS. Respondé ÚNICAMENTE con el nombre EXACTO de la lista que corresponda (copiado tal cual), o la " +
            "palabra NINGUNA si de verdad no corresponde ninguno. Nunca inventes un nombre que no esté en la lista.",
          messages: [
            {
              role: "user",
              content:
                `Municipio/ciudad detectado por GPS: "${localidadCruda}"\n\n` +
                `Localidades/zonas ya existentes en esa provincia:\n${localidadesConocidas.map((l) => `- ${l}`).join("\n")}`,
            },
          ],
        });
        const textBlock = response.content.find((b) => b.type === "text");
        const sugerida = textBlock && "text" in textBlock ? textBlock.text.trim() : "";
        if (sugerida && sugerida !== "NINGUNA" && localidadesConocidas.includes(sugerida)) {
          localidad = sugerida;
        }
      } catch {
        // si la IA falla seguimos con el nombre crudo de Nominatim, no es crítico
      }
    }
  }

  return NextResponse.json({ tipo: "geocoded", provincia, localidad });
}
