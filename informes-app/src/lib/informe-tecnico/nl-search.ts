/**
 * Búsqueda en lenguaje natural del historial (spec sección 6.5): tokeniza la
 * consulta, ignora palabras vacías en español, reconoce nombres de mes y
 * filtra por el mes de la fecha del informe, y busca el resto de los tokens
 * como substring contra título/cliente/ticket/N° de generación/tipo/técnicos.
 */

const STOPWORDS = new Set(["el", "la", "de", "del", "en", "un", "una", "informe", "y", "los", "las", "para", "con"]);

const MESES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const DIACRITICS_RE = /[̀-ͯ]/g;

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(DIACRITICS_RE, "");
}

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
  const q = query.trim();
  if (!q) return items;

  const tokens = normalize(q)
    .split(/[^a-z0-9áéíóúñ]+/i)
    .map((t) => t.trim())
    .filter(Boolean);

  let mesFiltro: number | null = null;
  const textTokens: string[] = [];
  for (const t of tokens) {
    if (STOPWORDS.has(t)) continue;
    if (MESES[t]) {
      mesFiltro = MESES[t];
      continue;
    }
    textTokens.push(t);
  }

  return items.filter((item) => {
    if (mesFiltro != null) {
      const mesInforme = Number(item.fecha.slice(5, 7));
      if (mesInforme !== mesFiltro) return false;
    }
    if (textTokens.length === 0) return true;

    const haystack = normalize(
      [item.titulo, item.cliente, item.ticketNumero || "", item.numeroGeneracion, item.tipoInforme || "", ...item.tecnicos].join(
        " ",
      ),
    );
    return textTokens.every((t) => haystack.includes(t));
  });
}
