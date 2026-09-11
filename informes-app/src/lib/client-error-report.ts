/**
 * Reporta un error ocurrido en el navegador del usuario a
 * /api/errores/reportar, para verlo después en Configuración → Errores del
 * dispositivo (solo Administrador). Pensado para equipos que nosotros no
 * podemos probar directamente — así aprendemos qué falla en vez de
 * depender de que alguien nos cuente el error de memoria.
 *
 * Nunca lanza ni bloquea la UI: si el reporte en sí falla (sin conexión,
 * endpoint caído), se ignora en silencio.
 */
export function reportarErrorCliente(mensaje: string, contexto?: string, stack?: string) {
  try {
    fetch("/api/errores/reportar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mensaje: mensaje.slice(0, 2000),
        contexto,
        stack,
        url: typeof window !== "undefined" ? window.location.href : undefined,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // No debe romper nunca el flujo del usuario por un fallo al reportar.
  }
}
