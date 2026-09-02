/**
 * Nombre de archivo del PDF guardado en Storage — no un UUID interno, sino algo
 * que el técnico pueda reconocer si lo descarga o lo reenvía por WhatsApp/email:
 * N° de generación, fecha y hora en que se generó, nombre de la tarea (o motivo,
 * en Rendición de Gastos), provincia y ubicación (cuando aplican).
 */

function slug(texto: string): string {
  return (
    texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // quita acentos
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "-"
  );
}

function timestampCompacto(fecha: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(fecha).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}`;
}

export function buildInformeTecnicoFilename(opts: {
  numeroGeneracion: string;
  titulo: string;
  provincia: string | null;
  ubicacion: string | null;
  generadoEn?: Date;
}): string {
  const partes = [
    opts.numeroGeneracion,
    timestampCompacto(opts.generadoEn ?? new Date()),
    slug(opts.titulo),
    opts.provincia ? slug(opts.provincia) : null,
    opts.ubicacion ? slug(opts.ubicacion) : null,
  ].filter((p): p is string => Boolean(p));
  return `${partes.join("_")}.pdf`;
}

export function buildRendicionGastosFilename(opts: {
  numeroGeneracion: string;
  motivo: string;
  provincia: string | null;
  generadoEn?: Date;
}): string {
  const partes = [
    opts.numeroGeneracion,
    timestampCompacto(opts.generadoEn ?? new Date()),
    slug(opts.motivo),
    opts.provincia ? slug(opts.provincia) : null,
  ].filter((p): p is string => Boolean(p));
  return `${partes.join("_")}.pdf`;
}

/** El nombre para "Guardar como" es el último segmento del path en Storage. */
export function filenameDesdeStoragePath(path: string): string {
  return path.split("/").pop() || path;
}
