import { test } from "node:test";
import assert from "node:assert/strict";
import { armarMensajeDespacho } from "../src/logic/despacho.js";

test("armarMensajeDespacho arma título, cuerpo, texto de SMS y data con el eventoId", () => {
  const mensaje = armarMensajeDespacho({
    eventoId: "evt1",
    tipoEvento: "Incendio",
    sitioId: "sitio1",
    sitioNombre: "Planta de Refinación Principal",
  });

  assert.equal(mensaje.titulo, "🚨 Incendio — Planta de Refinación Principal");
  assert.match(mensaje.cuerpo, /punto de encuentro/);
  assert.match(mensaje.textoSms, /Incendio/);
  assert.match(mensaje.textoSms, /Planta de Refinación Principal/);
  assert.deepEqual(mensaje.data, { eventoId: "evt1", tipo: "Incendio", sitioId: "sitio1" });
});

test("armarMensajeDespacho refleja el tipo de evento tal cual viene (Sismo, Médico, etc.)", () => {
  const mensaje = armarMensajeDespacho({
    eventoId: "evt2",
    tipoEvento: "Sismo",
    sitioId: "sitio2",
    sitioNombre: "Predio de Despacho de Combustible",
  });
  assert.match(mensaje.titulo, /Sismo/);
  assert.equal(mensaje.data.tipo, "Sismo");
});

test("armarMensajeDespacho suma el escenario al cuerpo y al SMS cuando viene", () => {
  const mensaje = armarMensajeDespacho({
    eventoId: "evt3",
    tipoEvento: "Tóxico",
    sitioId: "sitio1",
    sitioNombre: "Planta de Refinación Principal",
    escenario: "Se rompió una válvula, hay derrame de líquido en Zona B.",
  });
  assert.match(mensaje.cuerpo, /Se rompió una válvula/);
  assert.match(mensaje.textoSms, /Se rompió una válvula/);
});

test("armarMensajeDespacho sin escenario queda con el texto genérico de siempre", () => {
  const mensaje = armarMensajeDespacho({
    eventoId: "evt4",
    tipoEvento: "Incendio",
    sitioId: "sitio1",
    sitioNombre: "Planta de Refinación Principal",
    escenario: null,
  });
  assert.equal(mensaje.cuerpo, "Diríjase a un punto de encuentro y confirme su estado en la app.");
});
