import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolverDestinatarios,
  canalDePersona,
  crearConfirmacionesIniciales,
  activarPuntosParaEvento,
  planificarEvento,
} from "../src/logic/eventos.js";
import type { Persona, PuntoEncuentro, TipoEvento, PayloadEventoMqtt } from "../src/types.js";

function persona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: "p1",
    organizacion_id: "org1",
    sitio_id: "sitio1",
    nombre: "Carlos Medina",
    dni: "28.441.902",
    telefono: "+54 9 291 400-1122",
    tipo: "fijo",
    estado: "activo",
    push_token: null,
    ...overrides,
  };
}

test("resolverDestinatarios excluye a quien no está activo", () => {
  const personas = [
    persona({ id: "a", estado: "activo" }),
    persona({ id: "b", estado: "de_baja" }),
    persona({ id: "c", estado: "vencido" }),
    persona({ id: "d", estado: "pendiente_aprobacion" }),
    persona({ id: "e", estado: "rechazado" }),
  ];
  const destinatarios = resolverDestinatarios(personas);
  assert.deepEqual(destinatarios.map((p) => p.id), ["a"]);
});

test("canalDePersona: push si hay token, sms si no", () => {
  assert.equal(canalDePersona(persona({ push_token: "tok123" })), "push");
  assert.equal(canalDePersona(persona({ push_token: null })), "sms");
});

test("crearConfirmacionesIniciales genera una fila pendiente por persona activa, con el canal correcto", () => {
  const personas = [
    persona({ id: "a", push_token: "tok" }),
    persona({ id: "b", push_token: null }),
    persona({ id: "c", estado: "de_baja" }), // no debería aparecer
  ];
  const confirmaciones = crearConfirmacionesIniciales(personas, "evt1");
  assert.equal(confirmaciones.length, 2);
  assert.deepEqual(confirmaciones, [
    { evento_id: "evt1", persona_id: "a", estado: "pendiente", canal: "push" },
    { evento_id: "evt1", persona_id: "b", estado: "pendiente", canal: "sms" },
  ]);
});

test("activarPuntosParaEvento solo incluye puntos activos, todos habilitados", () => {
  const puntos: PuntoEncuentro[] = [
    { id: "pt1", sitio_id: "s1", nombre: "Punto A", activo: true },
    { id: "pt2", sitio_id: "s1", nombre: "Punto B (dado de baja)", activo: false },
    { id: "pt3", sitio_id: "s1", nombre: "Punto C", activo: true },
  ];
  const resultado = activarPuntosParaEvento(puntos, "evt1");
  assert.deepEqual(resultado, [
    { evento_id: "evt1", punto_id: "pt1", habilitado: true },
    { evento_id: "evt1", punto_id: "pt3", habilitado: true },
  ]);
});

function payloadEvento(overrides: Partial<PayloadEventoMqtt> = {}): PayloadEventoMqtt {
  return {
    eventoId: "evt1",
    tipo: "INCENDIO",
    estado: "DISPARADO",
    notificacionEnviada: true,
    origen: "consola",
    consolaId: "c1",
    operadorId: "op1",
    operadorRol: "operador",
    modo: "REAL",
    simulacroProgramadoId: null,
    ts: 1000,
    ...overrides,
  };
}

const tipoIncendio: TipoEvento = { id: "t1", nombre: "Incendio", es_ok: false };
const tipoOk: TipoEvento = { id: "t2", nombre: "OK", es_ok: true };

test("planificarEvento: mensaje duplicado (reentrega QoS 1) se ignora", () => {
  const plan = planificarEvento(payloadEvento(), /* yaExiste */ true, tipoIncendio, null);
  assert.deepEqual(plan, { accion: "ignorar_duplicado", eventoId: "evt1" });
});

test("planificarEvento: CANCELADO nunca dispara nada, solo se audita", () => {
  const payload = payloadEvento({ estado: "CANCELADO", notificacionEnviada: false });
  const plan = planificarEvento(payload, false, tipoIncendio, null);
  assert.equal(plan.accion, "registrar_cancelado");
});

test("planificarEvento: un tipo normal (no OK) DISPARADO abre un evento nuevo", () => {
  const plan = planificarEvento(payloadEvento(), false, tipoIncendio, null);
  assert.deepEqual(plan, {
    accion: "abrir_evento",
    eventoId: "evt1",
    payload: payloadEvento(),
    esCierre: false,
  });
});

test("planificarEvento: OK con un evento en curso lo cierra, no abre uno nuevo", () => {
  const payload = payloadEvento({ eventoId: "evt2", tipo: "OK" });
  const plan = planificarEvento(payload, false, tipoOk, "evt1-en-curso");
  assert.deepEqual(plan, {
    accion: "cerrar_evento_existente",
    eventoId: "evt2",
    payload,
    eventoAbiertoId: "evt1-en-curso",
  });
});

test("planificarEvento: OK sin ningún evento en curso se registra igual, como caso raro (no fatal)", () => {
  const payload = payloadEvento({ eventoId: "evt2", tipo: "OK" });
  const plan = planificarEvento(payload, false, tipoOk, null);
  assert.deepEqual(plan, { accion: "abrir_evento", eventoId: "evt2", payload, esCierre: true });
});
