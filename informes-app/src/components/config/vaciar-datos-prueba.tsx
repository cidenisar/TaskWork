"use client";

import { useState } from "react";
import { vaciarDatosPruebaAction } from "@/app/(app)/configuracion/actions/mantenimiento";

const FRASE_CONFIRMACION = "BORRAR TODO";

/**
 * Pensado para un momento muy puntual: limpiar lo que se cargó de prueba
 * antes de que la app arranque en producción real. No es un botón de uso
 * diario (para borrar un registro suelto está el ícono de tacho en cada
 * Historial) — por eso el gate es más fuerte que un window.confirm: hay
 * que escribir la frase exacta para que el botón se habilite.
 */
export function VaciarDatosPruebaCard() {
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);

  const habilitado = texto.trim() === FRASE_CONFIRMACION;

  async function vaciar() {
    if (!habilitado || busy) return;
    setBusy(true);
    setResultado(null);
    const res = await vaciarDatosPruebaAction();
    setBusy(false);
    setTexto("");
    setResultado(
      res.success
        ? { ok: true, mensaje: "Listo — Informes, Rendiciones, Tableros, Racks, Equipos y Bajas quedaron en cero." }
        : { ok: false, mensaje: res.error || "No se pudo vaciar." },
    );
  }

  return (
    <div className="card" style={{ borderColor: "var(--accent-2)" }}>
      <div className="section-label" style={{ color: "var(--accent-2)" }}>
        Vaciar datos de prueba
      </div>
      <p className="hint" style={{ margin: "0 0 14px" }}>
        Borra <b>TODO</b> lo cargado hasta ahora en Informes Técnicos, Rendiciones de Gastos, Tableros, Racks, Equipos
        Individuales y Bajas de Equipamiento — el equipo cargado en cada sitio incluido, no solo el historial de
        mediciones/relevamientos — y vacía los PDFs/fotos del storage. Pensado para limpiar las pruebas antes de
        arrancar en producción real, no para uso diario. <b>No se puede deshacer.</b> No toca Ubicaciones, catálogos,
        usuarios ni el resto de Configuración.
      </p>

      <div className="field">
        <label>
          Escribí <code>{FRASE_CONFIRMACION}</code> para habilitar el botón
        </label>
        <input type="text" value={texto} onChange={(e) => setTexto(e.target.value)} disabled={busy} placeholder={FRASE_CONFIRMACION} />
      </div>

      {resultado && (
        <div className="hint" style={{ color: resultado.ok ? "var(--ok)" : "var(--warn)", margin: "0 0 10px" }}>
          {resultado.mensaje}
        </div>
      )}

      <button type="button" className="btn btn-danger btn-sm" disabled={!habilitado || busy} onClick={vaciar}>
        {busy ? "Vaciando..." : "Vaciar datos de prueba"}
      </button>
    </div>
  );
}
