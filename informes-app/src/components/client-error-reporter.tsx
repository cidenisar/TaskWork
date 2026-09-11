"use client";

import { useEffect } from "react";
import { reportarErrorCliente } from "@/lib/client-error-report";

/**
 * Atrapa errores de JS no manejados y promesas rechazadas sin catch en
 * cualquier pantalla de la app y los manda a reportarErrorCliente — cubre
 * lo que un try/catch puntual en un formulario no llega a agarrar. No
 * renderiza nada, se monta una sola vez en el layout raíz.
 */
export function ClientErrorReporter() {
  useEffect(() => {
    function onError(e: ErrorEvent) {
      reportarErrorCliente(e.message || "Error sin mensaje", "window.onerror", e.error?.stack);
    }
    function onRejection(e: PromiseRejectionEvent) {
      const reason = e.reason;
      const mensaje = reason instanceof Error ? reason.message : String(reason);
      reportarErrorCliente(mensaje, "unhandledrejection", reason instanceof Error ? reason.stack : undefined);
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
