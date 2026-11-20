// "Un test por rol de lo que ese rol NO puede hacer" — HANDOFF §4 y §12. Acá
// se testea la decisión pura; la fila (fue vos, es tu evento) y las
// policies RLS son la otra mitad, no pura, de la misma regla.
import test from "node:test";
import assert from "node:assert/strict";
import {
  esOficina,
  esGuardiaGeneral,
  esDeGuardia,
  puedeRegistrarLlamada,
  puedeActivarGuardiaTecnica,
  puedeCerrarEvento,
  puedeMarcarFeriadoDesdeElCelu,
  puedeCorregir,
  puedeCerrarPeriodo,
  puedeEditarParametros,
  puedeGestionarCronograma,
  puedeGestionarPersonasDeGuardia,
  puedeGestionarCambiosDeGuardia,
  puedeAnularCambioDeGuardia,
  puedeVerTodosLosEventos,
  type ContextoGuardia,
} from "./permisos";

const guardiaGeneral: ContextoGuardia = { rol: "tecnico", areas: ["General"] };
const tecnicoInfra: ContextoGuardia = { rol: "tecnico", areas: ["Infraestructura"] };
const tecnicoSinGuardia: ContextoGuardia = { rol: "tecnico", areas: [] };
const tecnicoInfraYGeneral: ContextoGuardia = { rol: "tecnico", areas: ["Infraestructura", "General"] };

test("guardia general: puede registrar llamada, activar guardia técnica y cerrar evento", () => {
  assert.equal(puedeRegistrarLlamada(guardiaGeneral), true);
  assert.equal(puedeActivarGuardiaTecnica(guardiaGeneral), true);
  assert.equal(puedeCerrarEvento(guardiaGeneral), true);
});

test("técnico de un área técnica NO puede registrar llamada, activar guardia ni cerrar evento (eso es solo de guardia general)", () => {
  assert.equal(puedeRegistrarLlamada(tecnicoInfra), false);
  assert.equal(puedeActivarGuardiaTecnica(tecnicoInfra), false);
  assert.equal(puedeCerrarEvento(tecnicoInfra), false);
});

test("técnico sin guardia asignada NO puede registrar llamada ni activar — no hace guardia", () => {
  assert.equal(puedeRegistrarLlamada(tecnicoSinGuardia), false);
  assert.equal(esDeGuardia(tecnicoSinGuardia), false);
});

for (const rolOficina of ["admin", "supervisor", "superusuario"] as const) {
  test(`${rolOficina}: es oficina, puede corregir, cerrar período, editar parámetros, gestionar cronograma/personas/cambios, ver todos los eventos`, () => {
    assert.equal(esOficina(rolOficina), true);
    assert.equal(puedeCorregir(rolOficina), true);
    assert.equal(puedeCerrarPeriodo(rolOficina), true);
    assert.equal(puedeEditarParametros(rolOficina), true);
    assert.equal(puedeGestionarCronograma(rolOficina), true);
    assert.equal(puedeGestionarPersonasDeGuardia(rolOficina), true);
    assert.equal(puedeGestionarCambiosDeGuardia(rolOficina), true);
    assert.equal(puedeAnularCambioDeGuardia(rolOficina), true);
    assert.equal(puedeVerTodosLosEventos(rolOficina), true);
  });
}

test("técnico (sea guardia general o de área) NUNCA puede corregir, cerrar período, editar parámetros, gestionar cronograma/personas/cambios, ni ver todos los eventos — aunque sea el que registró la llamada", () => {
  for (const ctx of [guardiaGeneral, tecnicoInfra, tecnicoSinGuardia]) {
    assert.equal(esOficina(ctx.rol), false);
    assert.equal(puedeCorregir(ctx.rol), false);
    assert.equal(puedeCerrarPeriodo(ctx.rol), false);
    assert.equal(puedeEditarParametros(ctx.rol), false);
    assert.equal(puedeGestionarCronograma(ctx.rol), false);
    assert.equal(puedeGestionarPersonasDeGuardia(ctx.rol), false);
    assert.equal(puedeGestionarCambiosDeGuardia(ctx.rol), false);
    assert.equal(puedeAnularCambioDeGuardia(ctx.rol), false);
    assert.equal(puedeVerTodosLosEventos(ctx.rol), false);
  }
});

test("marcar feriado desde el celu: guardia general y oficina pueden, un técnico de área NO", () => {
  assert.equal(puedeMarcarFeriadoDesdeElCelu(guardiaGeneral), true);
  assert.equal(puedeMarcarFeriadoDesdeElCelu({ rol: "admin", areas: [] }), true);
  assert.equal(puedeMarcarFeriadoDesdeElCelu(tecnicoInfra), false);
});

test("esGuardiaGeneral: nunca es true para un rol de oficina, aunque alguien le ponga area 'General' por error", () => {
  assert.equal(esGuardiaGeneral({ rol: "admin", areas: ["General"] }), false);
});

test("técnico que hace su guardia de área Y la general (pedido de Ivan, 12/11): puede todo lo de guardia general, sigue contando como guardia de esa área también", () => {
  assert.equal(esGuardiaGeneral(tecnicoInfraYGeneral), true);
  assert.equal(esDeGuardia(tecnicoInfraYGeneral), true);
  assert.equal(puedeRegistrarLlamada(tecnicoInfraYGeneral), true);
  assert.equal(puedeActivarGuardiaTecnica(tecnicoInfraYGeneral), true);
  assert.equal(puedeCerrarEvento(tecnicoInfraYGeneral), true);
});
