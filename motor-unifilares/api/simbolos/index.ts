/**
 * GET /api/simbolos (listar) + POST /api/simbolos (guardar uno o más ya
 * revisados) — mismo contrato que server.ts local, ver ese archivo.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { listarSimbolos, guardarSimbolos } from "../../src/simbolos-store.js";
import { validarDrawCommand } from "../../src/anthropic-client.js";
import type { Simbolo } from "../../src/types.js";

function validarSimboloCompleto(o: Record<string, unknown>): boolean {
  if (typeof o.nombre !== "string" || !/^[a-z0-9_]+$/.test(o.nombre)) return false;
  if (typeof o.descripcion !== "string") return false;
  if (typeof o.ancho !== "number" || typeof o.alto !== "number") return false;
  if (!Array.isArray(o.commands) || o.commands.length === 0) return false;
  return o.commands.every((c) => validarDrawCommand(c));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    try {
      const simbolos = await listarSimbolos();
      res.status(200).json({ simbolos });
    } catch (err) {
      console.error("[motor-unifilares] error listando símbolos:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Error inesperado listando símbolos." });
    }
    return;
  }

  if (req.method === "POST") {
    const pedido = (req.body ?? {}) as { simbolos?: unknown };
    if (!Array.isArray(pedido.simbolos) || pedido.simbolos.length === 0) {
      res.status(400).json({ error: 'Falta "simbolos" (array no vacío).' });
      return;
    }
    const invalidos = pedido.simbolos.filter((s) => !validarSimboloCompleto(s));
    if (invalidos.length > 0) {
      res.status(400).json({ error: `${invalidos.length} de ${pedido.simbolos.length} símbolos no tienen una forma válida.` });
      return;
    }
    try {
      await guardarSimbolos(pedido.simbolos as Simbolo[]);
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[motor-unifilares] error guardando símbolos:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Error inesperado guardando la librería de símbolos." });
    }
    return;
  }

  res.status(405).json({ error: "Método no permitido." });
}
