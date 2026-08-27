// Handler de `consolas/{id}/eventos` — orquesta lógica pura (src/logic) +
// base de datos (src/lib/db) + publicaciones MQTT derivadas.

import type { MqttClient } from "mqtt";
import type { Db } from "../lib/db.js";
import type { Despachador } from "../lib/despachador.js";
import { publicarEventoActivo, publicarAccountability } from "../lib/mqtt.js";
import { planificarEvento, crearConfirmacionesIniciales, activarPuntosParaEvento } from "../logic/eventos.js";
import { calcularAccountability } from "../logic/accountability.js";
import { armarMensajeDespacho } from "../logic/despacho.js";
import { resolverConsolasParaEventoActivo } from "../logic/eventoActivo.js";
import type { Persona, PayloadEventoMqtt, PayloadEventoActivoMqtt } from "../types.js";

export async function manejarEvento(
  db: Db,
  mqttClient: MqttClient,
  despachador: Despachador,
  payload: PayloadEventoMqtt
): Promise<void> {
  const consola = await db.getConsolaPorId(payload.consolaId);
  if (!consola) {
    console.error(`[eventos] consola desconocida: ${payload.consolaId} — se ignora el mensaje`);
    return;
  }
  const sitioId = consola.sitio_id;

  // organizacion_id no viaja en el payload MQTT (ver contrato) — se resuelve
  // una sola vez acá y se reusa para todo lo que sigue de este mensaje.
  const organizacionId = await db.getSitioOrganizacionId(sitioId);

  const tipoEvento = await db.getTipoEventoPorNombre(organizacionId, payload.tipo);
  if (!tipoEvento) {
    console.error(`[eventos] tipo de evento desconocido: "${payload.tipo}" — se ignora el mensaje`);
    return;
  }

  const yaExiste = await db.existeEvento(payload.eventoId);
  const eventoEnCursoId = await db.getEventoEnCursoDeSitio(sitioId);

  const plan = planificarEvento(payload, yaExiste, tipoEvento, eventoEnCursoId);

  switch (plan.accion) {
    case "ignorar_duplicado":
      console.log(`[eventos] duplicado ignorado: ${plan.eventoId}`);
      return;

    case "registrar_cancelado":
      // Ver "OK vs. CANCELAR — resuelto": nunca dispara nada, solo auditoría.
      // No hay tabla dedicada a intentos cancelados en el modelo actual — se
      // deja como TODO explícito en vez de inventar una tabla no pedida por
      // ninguna ficha (ver README, "Decisiones pendientes").
      console.log(`[eventos] CANCELADO auditado (sin efecto): ${plan.eventoId}`);
      return;

    case "abrir_evento": {
      // esCierre = true es el caso raro de OK sin ningún evento en curso que
      // cerrar (ver planificarEvento) — igual hay que insertarlo ya
      // resuelto, nunca "en_curso": si no, queda como el evento en_curso más
      // reciente del sitio para siempre (nadie lo va a cerrar nunca, porque
      // un OK no es algo que en sí mismo se cierre).
      await db.insertEvento({
        id: plan.eventoId,
        organizacion_id: organizacionId,
        sitio_id: sitioId,
        consola_id: payload.consolaId,
        operador_id: payload.operadorId,
        tipo_evento_id: tipoEvento.id,
        modo: payload.modo === "REAL" ? "real" : "simulacro",
        simulacro_programado_id: payload.simulacroProgramadoId,
        notificacion_enviada: payload.notificacionEnviada,
        ...(plan.esCierre ? { estado: "cerrado" as const, cerrado_at: new Date().toISOString() } : {}),
      });

      if (!plan.esCierre) {
        // Evento real (no OK): activar puntos + crear confirmaciones para
        // todo el personal activo del sitio (ver ficha, "Padrón de Personas").
        const [personas, puntos, sitioNombre] = await Promise.all([
          db.getPersonasActivasDeSitio(sitioId),
          db.getPuntosActivosDeSitio(sitioId),
          db.getSitioNombre(sitioId),
        ]);
        await db.insertConfirmacionesIniciales(crearConfirmacionesIniciales(personas, plan.eventoId));
        await db.insertEventosPuntosEstado(activarPuntosParaEvento(puntos, plan.eventoId));

        await despacharATodos(despachador, personas, {
          eventoId: plan.eventoId,
          tipoEvento: payload.tipo,
          sitioId,
          sitioNombre,
        });
      }

      // Un OK nunca es, en sí mismo, un evento activo — ni siquiera en este
      // caso raro sin nada que cerrar (mismo criterio que el cierre normal,
      // más abajo, que también publica null).
      await publicarEventoActivoParaSitio(
        db,
        mqttClient,
        sitioId,
        plan.esCierre
          ? null
          : { eventoId: plan.eventoId, tipo: payload.tipo, modo: payload.modo, consolaOrigenId: payload.consolaId }
      );
      return;
    }

    case "cerrar_evento_existente": {
      await db.cerrarEvento(plan.eventoAbiertoId);

      // Registrar el propio evento OK también, para el historial (ver ficha:
      // "OK ... es un tipo de evento real más, con despacho completo"). Se
      // inserta ya "cerrado" — es un registro de algo ya resuelto, no una
      // emergencia en curso (mismo motivo que en el caso "abrir_evento" de
      // arriba: dejarlo en el default "en_curso" lo deja colgado para
      // siempre como si el sitio siguiera en emergencia).
      const ahora = new Date().toISOString();
      await db.insertEvento({
        id: plan.eventoId,
        organizacion_id: organizacionId,
        sitio_id: sitioId,
        consola_id: payload.consolaId,
        operador_id: payload.operadorId,
        tipo_evento_id: tipoEvento.id,
        modo: payload.modo === "REAL" ? "real" : "simulacro",
        simulacro_programado_id: payload.simulacroProgramadoId,
        notificacion_enviada: payload.notificacionEnviada,
        estado: "cerrado",
        cerrado_at: ahora,
      });

      // Al cerrar, no queda ningún evento activo relevante para el sitio.
      await publicarEventoActivoParaSitio(db, mqttClient, sitioId, null);
      return;
    }
  }
}

/**
 * Despacha a todos los destinatarios en paralelo. Un token de push inválido
 * o un número que Twilio rechaza no debe tumbar el resto del evento — se
 * loguea cada fallo individual y se sigue; el conteo final queda en un solo
 * log de resumen (mismo lugar donde antes estaba el placeholder).
 */
async function despacharATodos(
  despachador: Despachador,
  personas: Persona[],
  contexto: { eventoId: string; tipoEvento: string; sitioId: string; sitioNombre: string }
): Promise<void> {
  const mensaje = armarMensajeDespacho(contexto);
  const resultados = await Promise.allSettled(personas.map((p) => despachador.despacharAPersona(p, mensaje)));

  let fallidos = 0;
  resultados.forEach((r, i) => {
    if (r.status === "rejected") {
      fallidos++;
      console.error(`[eventos] error despachando a persona ${personas[i].id}:`, r.reason);
    }
  });

  const ok = personas.length - fallidos;
  console.log(
    `[eventos] evento ${contexto.eventoId} abierto en sitio ${contexto.sitioId} — despachado a ${ok}/${personas.length} destinatarios` +
      (fallidos > 0 ? ` (${fallidos} fallidos, ver log de arriba)` : "")
  );
}

async function publicarEventoActivoParaSitio(
  db: Db,
  mqttClient: MqttClient,
  sitioId: string,
  info: { eventoId: string; tipo: string; modo: "REAL" | "SIMULACRO"; consolaOrigenId: string } | null
): Promise<void> {
  const vecinos = await db.getSitiosVecinos(sitioId);
  const consolasPorSitio = new Map<string, string[]>();
  consolasPorSitio.set(sitioId, await db.getConsolasActivasDeSitio(sitioId));
  for (const vecinoId of vecinos) {
    consolasPorSitio.set(vecinoId, await db.getConsolasActivasDeSitio(vecinoId));
  }

  const destinos = resolverConsolasParaEventoActivo(sitioId, vecinos, consolasPorSitio);
  if (destinos.length === 0) return;

  let payloadBase: Omit<PayloadEventoActivoMqtt, "relacion"> | null = null;
  if (info !== null) {
    const [sitioNombre, consolaOrigenNombre] = await Promise.all([
      db.getSitioNombre(sitioId),
      db.getConsolaNombre(info.consolaOrigenId),
    ]);
    payloadBase = {
      eventoId: info.eventoId,
      tipo: info.tipo,
      modo: info.modo,
      sitioNombre,
      consolaOrigenNombre,
      ts: Date.now(),
    };
  }

  for (const destino of destinos) {
    if (payloadBase === null) {
      publicarEventoActivo(mqttClient, destino.consolaId, null);
    } else {
      const payload: PayloadEventoActivoMqtt = { ...payloadBase, relacion: destino.relacion };
      publicarEventoActivo(mqttClient, destino.consolaId, payload);
    }
  }
}

export async function publicarAccountabilityDeEvento(
  db: Db,
  mqttClient: MqttClient,
  eventoId: string,
  sitioId: string
): Promise<void> {
  const [confirmaciones, puntos, consolas] = await Promise.all([
    db.getConfirmacionesDeEvento(eventoId),
    db.getPuntosActivosDeSitio(sitioId),
    db.getConsolasActivasDeSitio(sitioId),
  ]);
  const resumen = calcularAccountability(eventoId, confirmaciones, puntos);
  for (const consolaId of consolas) {
    publicarAccountability(mqttClient, consolaId, eventoId, resumen);
  }
}
