/**
 * Búsqueda en lenguaje natural compartida por los historiales (spec sección
 * 6.5, reutilizada en 7.4): tokeniza la consulta, ignora palabras vacías en
 * español, reconoce nombres de mes y filtra por el mes de una fecha
 * (YYYY-MM-DD), y matchea el resto de los tokens como substring contra un
 * "haystack" armado por cada módulo.
 */

const STOPWORDS = new Set(["el", "la", "de", "del", "en", "un", "una", "informe", "rendicion", "y", "los", "las", "para", "con"]);

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

export function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(DIACRITICS_RE, "");
}

export interface ConsultaTokenizada {
  mesFiltro: number | null;
  textTokens: string[];
}

export function tokenizarConsultaNatural(query: string): ConsultaTokenizada {
  const tokens = normalize(query)
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
  return { mesFiltro, textTokens };
}

export function filtrarPorConsultaNatural<T>(
  items: T[],
  query: string,
  opts: { fecha: (item: T) => string; haystack: (item: T) => string },
): T[] {
  const q = query.trim();
  if (!q) return items;

  const { mesFiltro, textTokens } = tokenizarConsultaNatural(q);

  return items.filter((item) => {
    if (mesFiltro != null) {
      const mes = Number(opts.fecha(item).slice(5, 7));
      if (mes !== mesFiltro) return false;
    }
    if (textTokens.length === 0) return true;
    const haystack = normalize(opts.haystack(item));
    return textTokens.every((t) => haystack.includes(t));
  });
}
