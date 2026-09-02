import { filtrarPorConsultaNatural } from "@/lib/nl-search";

export interface HistorialRendicionBuscable {
  motivo: string;
  proyectoCliente: string | null;
  numeroGeneracion: string;
  tecnicos: string[];
  fecha: string; // YYYY-MM-DD
}

export function filtrarRendicionesPorConsulta<T extends HistorialRendicionBuscable>(items: T[], query: string): T[] {
  return filtrarPorConsultaNatural(items, query, {
    fecha: (i) => i.fecha,
    haystack: (i) => [i.motivo, i.proyectoCliente || "", i.numeroGeneracion, ...i.tecnicos].join(" "),
  });
}
