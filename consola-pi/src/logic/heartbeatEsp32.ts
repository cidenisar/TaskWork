// Pura — decide si el heartbeat del ESP32 está vencido, sin tocar
// `Date.now()`/timers reales (eso vive en index.ts,
// `chequearHeartbeatEsp32Vencido`). Ver README, "esp32HeartbeatOk no
// tenía timeout" — sin esto, si el ESP32 se cuelga o se desconecta el
// UART (deja de mandar heartbeats por completo, no manda uno con
// ok:false), la Pi se queda con el último valor conocido para siempre.

/**
 * `ultimoTs` es el epoch ms del último heartbeat recibido, o `null` si
 * todavía no llegó ninguno desde que arrancó el proceso — en ese caso
 * se considera vencido de entrada (no hay nada que confirme que el
 * ESP32 está vivo).
 */
export function heartbeatEsp32Vencido(ultimoTs: number | null, ahora: number, timeoutMs: number): boolean {
  if (ultimoTs === null) return true;
  return ahora - ultimoTs > timeoutMs;
}
