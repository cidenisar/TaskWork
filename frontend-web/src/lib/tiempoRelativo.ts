/** "03:41" (mm:ss desde `iniciadoAt` hasta `ahoraMs`) — reloj del evento en Accountability en vivo. Sin tope: un evento largo pasa de 59:59 sin romperse. */
export function formatearReloj(iniciadoAt: string, ahoraMs: number): string {
  const segs = Math.max(0, Math.floor((ahoraMs - new Date(iniciadoAt).getTime()) / 1000));
  const m = Math.floor(segs / 60);
  const s = segs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** "15/08/2026" — fecha absoluta, para vistas de cumplimiento donde lo relativo ("hace 2 semanas") es menos útil que la fecha exacta. */
export function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** "hace 2 horas" / "hace 1 día" — mismo estilo que Cowork "Administración de Padrón de Personas". */
export function tiempoRelativo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} hora${horas === 1 ? "" : "s"}`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} día${dias === 1 ? "" : "s"}`;
}
