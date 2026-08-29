// Limitador simple en memoria, ventana fija por clave — ver README,
// "Precauciones al habilitar Anonymous Sign-ins". Cualquiera puede
// conseguir un JWT nuevo gratis (`signInAnonymously()`, sin
// verificación de ningún tipo) — sin esto, los endpoints de
// autoregistro quedaban con la única protección de "adiviná
// legajo+DNI o el código" sin ningún límite de intentos.
//
// Vale para un solo proceso — el estado vive en memoria, no se
// comparte entre instancias. Suficiente para el tamaño de este
// despliegue (un solo proceso de backend-server); si algún día hay más
// de una instancia corriendo en paralelo detrás de un balanceador,
// esto necesitaría moverse a Redis o Postgres para que el límite sea
// real entre todas.

interface Registro {
  cuenta: number;
  desde: number;
}

const registros = new Map<string, Registro>();

/**
 * Devuelve `true` si `clave` todavía tiene cupo dentro de la ventana
 * actual (y consume un intento), `false` si ya se pasó de
 * `maxIntentos` — en cuyo caso NO consume otro intento, para que un
 * cliente insistiendo no extienda la ventana de bloqueo.
 *
 * `ahora` inyectable para poder testear determinísticamente (ver
 * test/rateLimit.test.ts) — en producción se usa el reloj real.
 */
export function permitirIntento(clave: string, maxIntentos: number, ventanaMs: number, ahora: number = Date.now()): boolean {
  const registro = registros.get(clave);
  if (!registro || ahora - registro.desde >= ventanaMs) {
    registros.set(clave, { cuenta: 1, desde: ahora });
    return true;
  }
  if (registro.cuenta >= maxIntentos) return false;
  registro.cuenta++;
  return true;
}

// Poda periódica — sin esto, `registros` crece para siempre con una
// entrada por cada IP/clave que haya pasado alguna vez, aunque su
// ventana ya haya vencido hace rato. Cada hora alcanza de sobra: el
// mapa no se usa para nada crítico en el medio de una poda.
const VENTANA_MAX_RAZONABLE_MS = 60 * 60 * 1000;
setInterval(() => {
  const ahora = Date.now();
  for (const [clave, registro] of registros) {
    if (ahora - registro.desde >= VENTANA_MAX_RAZONABLE_MS) registros.delete(clave);
  }
}, VENTANA_MAX_RAZONABLE_MS).unref();
