// Lógica de negocio pura para el ciclo de vida de un evento — sin I/O, para
// poder testearla sin depender de Postgres ni del broker MQTT (ver
// test/eventos.test.ts). Los handlers en src/handlers/eventos.ts son los que
// llaman a estas funciones y después ejecutan el plan resultante contra la
// base de datos real.
//
// Referencia: 03-backend-online.md ("Padrón de Personas", "Puntos de
// encuentro", "OK vs. Cancelar") y 05.3-programacion.md ("OK vs. CANCELAR —
// resuelto").

import type { Persona, PuntoEncuentro, TipoEvento, PayloadEventoMqtt } from "../types.js";

export interface ConfirmacionInicial {
  evento_id: string;
  persona_id: string;
  estado: "pendiente";
  canal: "push" | "sms";
}

export interface EventoPuntoInicial {
  evento_id: string;
  punto_id: string;
  habilitado: true;
}

/**
 * Quién recibe la alerta de este evento. Filtra a solo personas activas —
 * de_baja/vencido/pendiente_aprobacion/rechazado nunca reciben nada.
 * El llamador ya debería haber filtrado por sitio en la consulta a la base;
 * este filtro es la última barrera, no la única.
 */
export function resolverDestinatarios(personas: Persona[]): Persona[] {
  return personas.filter((p) => p.estado === "activo");
}

/** Cobertura de alerta: push si hay token, si no SMS de respaldo (ver ficha, "El SMS depende únicamente de este padrón"). */
export function canalDePersona(persona: Persona): "push" | "sms" {
  return persona.push_token ? "push" : "sms";
}

export function crearConfirmacionesIniciales(personas: Persona[], eventoId: string): ConfirmacionInicial[] {
  return resolverDestinatarios(personas).map((p) => ({
    evento_id: eventoId,
    persona_id: p.id,
    estado: "pendiente",
    canal: canalDePersona(p),
  }));
}

/**
 * Al arrancar un evento, todos los puntos de encuentro ACTIVOS del sitio
 * nacen habilitados (ver ficha, "nace en true para todos los puntos activos
 * cuando arranca el evento"). Los puntos dados de baja (no activos) ni
 * siquiera entran en la lista — no son una opción para nadie, evento o no.
 */
export function activarPuntosParaEvento(puntos: PuntoEncuentro[], eventoId: string): EventoPuntoInicial[] {
  return puntos
    .filter((p) => p.activo)
    .map((p) => ({ evento_id: eventoId, punto_id: p.id, habilitado: true }));
}

export type PlanEvento =
  | { accion: "ignorar_duplicado"; eventoId: string }
  | { accion: "registrar_cancelado"; eventoId: string; payload: PayloadEventoMqtt }
  | { accion: "abrir_evento"; eventoId: string; payload: PayloadEventoMqtt; esCierre: boolean }
  | { accion: "cerrar_evento_existente"; eventoId: string; payload: PayloadEventoMqtt; eventoAbiertoId: string };

/**
 * Decide qué hay que hacer con un mensaje de `consolas/{id}/eventos`, sin
 * tocar la base todavía — el handler ejecuta el plan. Cubre:
 *  - Idempotencia: MQTT QoS 1 puede reentregar el mismo mensaje; el eventoId
 *    lo genera la propia consola, así que si ya existe no hay que reprocesar.
 *  - CANCELAR nunca dispara nada — ver "OK vs. CANCELAR — resuelto" (ficha
 *    Programación): es 100% local a la consola, acá solo queda auditado.
 *  - OK es un evento real más, pero su efecto es CERRAR el evento en curso
 *    del sitio, no abrir uno nuevo — es "la única forma de deshacer una
 *    alerta ya enviada" (ver ficha).
 */
export function planificarEvento(
  payload: PayloadEventoMqtt,
  yaExiste: boolean,
  tipoEvento: TipoEvento,
  eventoEnCursoDelSitioId: string | null
): PlanEvento {
  if (yaExiste) {
    return { accion: "ignorar_duplicado", eventoId: payload.eventoId };
  }

  if (payload.estado === "CANCELADO") {
    return { accion: "registrar_cancelado", eventoId: payload.eventoId, payload };
  }

  // estado === "DISPARADO"
  if (tipoEvento.es_ok) {
    if (eventoEnCursoDelSitioId) {
      return {
        accion: "cerrar_evento_existente",
        eventoId: payload.eventoId,
        payload,
        eventoAbiertoId: eventoEnCursoDelSitioId,
      };
    }
    // OK disparado sin ningún evento en curso: se registra igual (auditoría),
    // pero no hay nada que cerrar — lo trata el handler como caso raro, no
    // como error fatal (alguien pudo haber cerrado ya desde otra consola).
    return { accion: "abrir_evento", eventoId: payload.eventoId, payload, esCierre: true };
  }

  return { accion: "abrir_evento", eventoId: payload.eventoId, payload, esCierre: false };
}
