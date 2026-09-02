// Handler de `consolas/{id}/eventos` — orquesta lógica pura (src/logic) +
// base de datos (src/lib/db) + publicaciones MQTT derivadas.

import type { MqttClient } from "mqtt";
import type { Db } from "../lib/db.js";
import type { Despachador } from "../lib/despachador.js";
import { publicarEventoActivo, publicarAccountability } from "../lib/mqtt.js";
import {
  planificarEvento,
  crearConfirmacionesIniciales,
  activarPuntosParaEvento,
  canalDePersona,
} from "../logic/eventos.js";
import { armarAccountabilityDesdeContadores } from "../logic/accountability.js";
import { armarMensajeDespacho } from "../logic/despacho.js";
import { resolverConsolasParaEventoActivo } from "../logic/eventoActivo.js";
import { resolverSimulacroProgramado } from "./simulacro.js";
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
      // Decisión tomada con el usuario (2026-08-27): no hace falta una tabla
      // centralizada en Backend Online para esto — el historial local de
      // cada consola ya lo guarda, y es donde tiene sentido consultarlo (es
      // 100% local a la consola que lo generó). Este log es la auditoría
      // completa que corresponde acá, no un placeholder de algo pendiente.
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

      // Este evento es el simulacro programado disparándose de verdad — ver
      // README "Motor de recurrencia": sin esto, marcarSimulacrosVencidosComoNoRealizados
      // terminaría marcando como "no realizado" simulacros que sí se hicieron.
      // Se guarda la fila resuelta para sacarle el `escenario` (si tiene)
      // y sumarlo al mensaje de despacho, más abajo.
      const simulacroResuelto = payload.simulacroProgramadoId
        ? await resolverSimulacroProgramado(db, mqttClient, payload.simulacroProgramadoId, "realizado")
        : null;

      // Personas/puntos/sitioNombre se necesitan tanto para activar
      // puntos+confirmaciones (acá abajo) como para el despacho de
      // push/SMS (más abajo) — se resuelven una sola vez.
      let personasParaDespachar: Persona[] = [];
      let sitioNombreParaDespachar = "";
      let smsHabilitado = true;
      if (!plan.esCierre) {
        // Evento real (no OK): activar puntos + crear confirmaciones para
        // todo el personal activo del sitio (ver ficha, "Padrón de Personas").
        const [personas, puntos, sitioNombre, smsHab] = await Promise.all([
          db.getPersonasActivasDeSitio(sitioId),
          db.getPuntosActivosDeSitio(sitioId),
          db.getSitioNombre(sitioId),
          db.getSmsHabilitado(organizacionId),
        ]);
        await db.insertConfirmacionesIniciales(crearConfirmacionesIniciales(personas, plan.eventoId));
        await db.insertEventosPuntosEstado(activarPuntosParaEvento(puntos, plan.eventoId));
        personasParaDespachar = personas;
        sitioNombreParaDespachar = sitioNombre;
        smsHabilitado = smsHab;
      }

      // Publicar evento-activo ANTES del despacho de push/SMS a propósito:
      // este mensaje es lo que dispara la sirena/relé físico en el resto de
      // las consolas (ver `activarRele`) — no puede quedar detrás de un
      // despacho a miles de personas que puede tardar bastante más.
      // Un OK nunca es, en sí mismo, un evento activo — ni siquiera en el
      // caso raro sin nada que cerrar.
      await publicarEventoActivoParaSitio(
        db,
        mqttClient,
        sitioId,
        plan.esCierre
          ? null
          : {
              eventoId: plan.eventoId,
              tipo: payload.tipo,
              modo: payload.modo,
              consolaOrigenId: payload.consolaId,
              activarRele: tipoEvento.activa_rele,
              escenario: simulacroResuelto?.escenario ?? null,
            }
      );

      if (!plan.esCierre) {
        await despacharATodos(
          despachador,
          personasParaDespachar,
          {
            eventoId: plan.eventoId,
            tipoEvento: payload.tipo,
            sitioId,
            sitioNombre: sitioNombreParaDespachar,
            escenario: simulacroResuelto?.escenario ?? null,
          },
          smsHabilitado
        );
      }
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

      if (payload.simulacroProgramadoId) {
        await resolverSimulacroProgramado(db, mqttClient, payload.simulacroProgramadoId, "realizado");
      }

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
 *
 * `smsHabilitado` (2026-08-30, ver Db.getSmsHabilitado): con la
 * organización en `sms_habilitado = false`, a quien le toca SMS (ver
 * canalDePersona) directamente NO se le despacha nada — ni siquiera "modo
 * consola" (lib/sms.ts) lo imprime. Es la forma barata de cortar el costo
 * de SMS masivo (ver README) sin perder el push, que sigue andando igual.
 * Esas personas quedan sin confirmación jamás recibida por ese canal — es
 * la consecuencia esperada del toggle, no un bug.
 */
async function despacharATodos(
  despachador: Despachador,
  personas: Persona[],
  contexto: { eventoId: string; tipoEvento: string; sitioId: string; sitioNombre: string; escenario: string | null },
  smsHabilitado: boolean
): Promise<void> {
  const mensaje = armarMensajeDespacho(contexto);

  const aDespachar = smsHabilitado ? personas : personas.filter((p) => canalDePersona(p) !== "sms");
  const omitidosPorSms = personas.length - aDespachar.length;
  if (omitidosPorSms > 0) {
    console.log(
      `[eventos] evento ${contexto.eventoId}: SMS deshabilitado para esta organización (ver /configuracion) — ${omitidosPorSms} destinatario(s) sin push no reciben notificación`
    );
  }

  const resultados = await Promise.allSettled(aDespachar.map((p) => despachador.despacharAPersona(p, mensaje)));

  let fallidos = 0;
  resultados.forEach((r, i) => {
    if (r.status === "rejected") {
      fallidos++;
      console.error(`[eventos] error despachando a persona ${aDespachar[i].id}:`, r.reason);
    }
  });

  const ok = aDespachar.length - fallidos;
  console.log(
    `[eventos] evento ${contexto.eventoId} abierto en sitio ${contexto.sitioId} — despachado a ${ok}/${aDespachar.length} destinatarios` +
      (fallidos > 0 ? ` (${fallidos} fallidos, ver log de arriba)` : "") +
      (omitidosPorSms > 0 ? ` (${omitidosPorSms} omitidos por SMS deshabilitado)` : "")
  );
}

async function publicarEventoActivoParaSitio(
  db: Db,
  mqttClient: MqttClient,
  sitioId: string,
  info: {
    eventoId: string;
    tipo: string;
    modo: "REAL" | "SIMULACRO";
    consolaOrigenId: string;
    activarRele: boolean;
    escenario: string | null;
  } | null
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
      activarRele: info.activarRele,
      escenario: info.escenario,
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
  // Lee accountability_contadores (unas pocas filas, una por punto + una
  // para "sin punto") en vez de traer y recontar TODAS las confirmaciones
  // del evento — ver README "Contador incremental de Accountability" y
  // logic/accountability.ts, armarAccountabilityDesdeContadores.
  const [contadores, puntos, consolas] = await Promise.all([
    db.getContadoresAccountability(eventoId),
    db.getPuntosActivosDeSitio(sitioId),
    db.getConsolasActivasDeSitio(sitioId),
  ]);
  const resumen = armarAccountabilityDesdeContadores(eventoId, contadores, puntos);
  for (const consolaId of consolas) {
    publicarAccountability(mqttClient, consolaId, eventoId, resumen);
  }
}
