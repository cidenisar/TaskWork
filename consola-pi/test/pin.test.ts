import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { validarPin } from "../src/logic/pin.js";
import type { OperadorPadron } from "../src/types.js";

async function operador(overrides: Partial<OperadorPadron> & { pin: string }): Promise<OperadorPadron> {
  const { pin, ...resto } = overrides;
  return {
    id: "op1",
    legajo: "1234",
    rol: "operador",
    pinHash: await bcrypt.hash(pin, 4), // costo bajo — más rápido en tests, no importa la seguridad acá
    ...resto,
  };
}

test("validarPin: PIN correcto contra el operador que corresponde", async () => {
  const uno = await operador({ id: "op1", legajo: "1001", pin: "1111" });
  const dos = await operador({ id: "op2", legajo: "1002", pin: "2222", rol: "admin" });

  const resultado = await validarPin("2222", [uno, dos]);

  assert.equal(resultado.resultado, "valido");
  assert.equal(resultado.operadorId, "op2");
  assert.equal(resultado.legajo, "1002");
  assert.equal(resultado.rol, "admin");
});

test("validarPin: PIN que no matchea contra ningún operador", async () => {
  const uno = await operador({ id: "op1", pin: "1111" });

  const resultado = await validarPin("9999", [uno]);

  assert.equal(resultado.resultado, "invalido");
  assert.equal(resultado.operadorId, null);
  assert.equal(resultado.legajo, null);
  assert.equal(resultado.rol, null);
});

test("validarPin: padrón vacío nunca matchea nada", async () => {
  const resultado = await validarPin("1111", []);
  assert.equal(resultado.resultado, "invalido");
});

test("validarPin: PIN de un operador no confunde con el de otro (mismo prefijo)", async () => {
  const uno = await operador({ id: "op1", pin: "1234" });
  const dos = await operador({ id: "op2", pin: "12345" });

  const resultado = await validarPin("1234", [uno, dos]);

  assert.equal(resultado.resultado, "valido");
  assert.equal(resultado.operadorId, "op1");
});
