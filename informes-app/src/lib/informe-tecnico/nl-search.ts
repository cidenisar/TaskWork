import { filtrarPorConsultaNatural } from "@/lib/nl-search";

export interface HistorialInformeBuscable {
  titulo: string;
  cliente: string;
  ticketNumero: string | null;
  numeroGeneracion: string;
  tipoInforme: string | null;
  tecnicos: string[];
  fecha: string; // YYYY-MM-DD
}

export function filtrarInformesPorConsulta<T extends HistorialInformeBuscable>(items: T[], query: string): T[] {
  return filtrarPorConsultaNatural(items, query, {
    fecha: (i) => i.fecha,
    haystack: (i) =>
      [i.titulo, i.cliente, i.ticketNumero || "", i.numeroGeneracion, i.tipoInforme || "", ...i.tecnicos].join(" "),
  });
}
