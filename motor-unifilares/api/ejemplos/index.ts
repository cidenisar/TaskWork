/**
 * GET /api/ejemplos (listar) + POST /api/ejemplos (guardar uno ya
 * revisado) — mismo contrato que server.ts local, ver ese archivo.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { listarEjemplos, guardarEjemplo } from "../../src/ejemplos-store.js";
import { validarDrawCommand } from "../../src/anthropic-client.js";
import type { DrawCommand } from "../../src/types.js";

function validarEjemploCompleto(o: Record<string, unknown>): boolean {
  if (typeof o.tag !== "string" || !/^[a-z0-9_]+$/.test(o.tag)) return false;
  if (typeof o.cuandoAplica !== "string" || !o.cuandoAplica.trim()) return false;
  if (!Array.isArray(o.commands) || o.commands.length === 0) return false;
  return o.commands.every((c) => validarDrawCommand(c));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    try {
      const ejemplos = await listarEjemplos();
      res.status(200).json({ ejemplos });
    } catch (err) {
      console.error("[motor-unifilares] error listando ejemplos:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Error inesperado listando ejemplos." });
    }
    return;
  }

  if (req.method === "POST") {
    const pedido = (req.body ?? {}) as Record<string, unknown>;
    if (!validarEjemploCompleto(pedido)) {
      res.status(400).json({ error: 'Forma inválida — se espera {"tag","cuandoAplica","commands"} con comandos válidos.' });
      return;
    }
    try {
      await guardarEjemplo({ tag: pedido.tag as string, cuandoAplica: pedido.cuandoAplica as string, commands: pedido.commands as DrawCommand[] });
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[motor-unifilares] error guardando ejemplo:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Error inesperado guardando el ejemplo." });
    }
    return;
  }

  res.status(405).json({ error: "Método no permitido." });
}
