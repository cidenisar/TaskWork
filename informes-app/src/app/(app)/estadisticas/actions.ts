"use server";

import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";
import { puedeVerEstadisticas } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";

export interface VerificacionResult {
  success: boolean;
  error?: string;
  coincide?: boolean;
  comentario?: string;
}

const MAX_IMAGENES_ANALIZADAS = 4;

/**
 * Verificación de fotos vs. tarea declarada (spec sección 8.8 / 10 #9):
 * control de calidad on-demand con Claude vision — se dispara por informe,
 * no corre automático en cada carga de Estadísticas (costo/latencia).
 */
export async function verificarFotosInformeAction(informeId: string): Promise<VerificacionResult> {
  const profile = await requireProfile();
  if (!puedeVerEstadisticas(profile.rol)) {
    return { success: false, error: "No autorizado." };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { success: false, error: "La verificación con IA no está configurada en este entorno (falta ANTHROPIC_API_KEY)." };
  }

  const supabase = await createClient();

  const { data: informe, error: informeErr } = await supabase
    .from("informes_tecnicos")
    .select("titulo, descripcion_trabajo")
    .eq("id", informeId)
    .single();
  if (informeErr || !informe) return { success: false, error: "No se encontró el informe." };
  if (!informe.descripcion_trabajo?.trim()) {
    return { success: false, error: "El informe no tiene descripción del trabajo cargada." };
  }

  const { data: imagenes } = await supabase
    .from("informe_imagenes")
    .select("url")
    .eq("informe_id", informeId)
    .order("orden")
    .limit(MAX_IMAGENES_ANALIZADAS);
  if (!imagenes || imagenes.length === 0) {
    return { success: false, error: "El informe no tiene fotos adjuntas." };
  }

  const imageBlocks: Anthropic.ImageBlockParam[] = [];
  for (const img of imagenes) {
    const { data: blob, error: dlErr } = await supabase.storage.from("informe-fotos").download(img.url);
    if (dlErr || !blob) continue;
    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    imageBlocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } });
  }
  if (imageBlocks.length === 0) {
    return { success: false, error: "No se pudieron leer las fotos del informe." };
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 512,
      output_config: { effort: "low" },
      system:
        "Sos un control de calidad que compara fotos de trabajos técnicos de campo contra la descripción del " +
        "trabajo declarada, para detectar informes que convendría revisar antes de enviarlos. No inventes " +
        "detalles: describí solo lo que ves. Respondé ÚNICAMENTE con un JSON válido de la forma " +
        '{"coincide": boolean, "comentario": "una oración breve en español explicando por qué"}.',
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `Descripción del trabajo declarada: "${informe.descripcion_trabajo}". ¿Las fotos son consistentes con esta descripción?`,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (response.stop_reason === "refusal" || !textBlock) {
      return { success: false, error: "No se pudo analizar el informe." };
    }
    const parsed = JSON.parse(textBlock.text.trim().replace(/^```json\s*|\s*```$/g, ""));
    return { success: true, coincide: !!parsed.coincide, comentario: String(parsed.comentario || "") };
  } catch {
    return { success: false, error: "No se pudo contactar al servicio de IA (o la respuesta no tenía el formato esperado)." };
  }
}
