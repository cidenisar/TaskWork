import test from "node:test";
import assert from "node:assert/strict";
import { horaGuardiaIso } from "./reloj";

test("horaGuardiaIso: convierte UTC a hora local de Argentina (UTC-3), incluida la medianoche", () => {
  assert.equal(horaGuardiaIso(new Date("2026-09-16T03:00:00Z")), "2026-09-16T00:00");
  assert.equal(horaGuardiaIso(new Date("2026-09-16T12:00:00Z")), "2026-09-16T09:00");
  assert.equal(horaGuardiaIso(new Date("2026-09-16T02:59:00Z")), "2026-09-15T23:59"); // todavía el día anterior en ARG
});
