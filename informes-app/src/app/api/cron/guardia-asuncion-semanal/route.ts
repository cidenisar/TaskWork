import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { cargarCronograma, cargarCambiosAceptados, cargarParametros } from "@/lib/guardia/datos";
import { inicioSemana, guardiaSemana, cambioVigente, AREAS_GUARDIA } from "@/lib/guardia/cronograma";
import { horaGuardiaIso } from "@/lib/guardia/reloj";
import { notificar } from "@/lib/guardia/notificar";

/**
 * "Asumo la guardia" semanal (HANDOFF §7.6) — corre una vez por día (no
 * hace falta más: esto es auto-sanador, no depende de pegarle justo al
 * miércoles 10:00). Por cada área, si la semana actual todavía no tiene
 * su fila `guardia_asuncion`, la crea y avisa — salvo que un cambio
 * aceptado ya cubra esta semana, en cuyo caso el "Asumo" de ESE cambio ya
 * cuenta (HANDOFF: "no aparece si está cubriendo por un cambio
 * aceptado") y no hace falta una fila aparte.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Falta CRON_SECRET en las variables de entorno." }, { status: 500 });
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const service = createServiceRoleClient();
  const [cronograma, cambios, parametros] = await Promise.all([
    cargarCronograma(service),
    cargarCambiosAceptados(service),
    cargarParametros(service),
  ]);
  const semanaActual = inicioSemana(horaGuardiaIso(), parametros.cambioMin);

  const creadas: string[] = [];
  const omitidas: string[] = [];
  for (const area of AREAS_GUARDIA) {
    if (cambioVigente(cambios, area, semanaActual)) {
      omitidas.push(`${area} (cubierta por un cambio aceptado)`);
      continue;
    }
    const usuarioId = guardiaSemana(cronograma, area, semanaActual);
    if (!usuarioId) {
      omitidas.push(`${area} (sin asignar)`);
      continue;
    }

    const { data: existente } = await service.from("guardia_asuncion").select("usuario_id").eq("semana_inicio", semanaActual).eq("area", area).maybeSingle();
    if (existente) {
      omitidas.push(`${area} (ya tenía fila esta semana)`);
      continue;
    }

    const { error } = await service.from("guardia_asuncion").insert({ semana_inicio: semanaActual, area, usuario_id: usuarioId });
    if (error) {
      omitidas.push(`${area} (error: ${error.message})`);
      continue;
    }

    await notificar(usuarioId, "asuncion_semanal", "guardia_asuncion", `${semanaActual}:${area}`, {
      title: `Asumís la guardia de ${area}`,
      body: `Semana desde el miércoles — tocá para confirmar.`,
      url: "/guardia",
    });
    creadas.push(area);
  }

  return NextResponse.json({ semanaActual, creadas, omitidas });
}
