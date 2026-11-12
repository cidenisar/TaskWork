// Motor de cálculo de activaciones de guardia.
// Sin pantallas y sin dependencias. Trabaja con minutos enteros (nunca decimales).
// Las fechas entran como hora LOCAL "AAAA-MM-DDTHH:MM": el servidor convierte la
// hora real a la zona de la guardia antes de llamar (la zona es un parámetro del
// sistema, no vive acá).

// Todo lo que la empresa puede revisar vive acá, en un solo lugar.
// En la app final estos valores salen de la pantalla de parámetros, con historial.
export const PARAMETROS = {
  entradaMin: 7 * 60 + 30, //     07:30 desde acá, en día hábil, un llamado es dedicación funcional
  salidaActivacionMin: 17 * 60, // 17:00 desde acá, en día hábil, un llamado es activación
  madrugadaHastaMin: 7 * 60 + 30, // 07:30 un llamado de madrugada cuenta hasta acá
  topeMediaMin: 4 * 60 + 30, //   hasta 4:30 hs en el día = media activación
  valorMedia: 1, //               unidad: "medias activaciones" (1 = media)
  valorEntera: 2, //              2 = una activación entera
};

const MIN_DIA = 1440;

function absoluto(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Fecha inválida: ${iso} (formato AAAA-MM-DDTHH:MM)`);
  const [, y, mo, d, h, mi] = m.map(Number);
  return (Date.UTC(y, mo - 1, d) / 86400000) * MIN_DIA + h * 60 + mi;
}

const fechaDeDia = (dia) => new Date(dia * 86400000).toISOString().slice(0, 10);

function esNoLaborable(dia, feriados) {
  const semana = new Date(dia * 86400000).getUTCDay(); // 0 domingo, 6 sábado
  return semana === 0 || semana === 6 || feriados.has(fechaDeDia(dia));
}

// Un evento de una persona. Devuelve el tipo y los minutos de activación por día.
// Regla: el INICIO clasifica. Después, cada día se parte por separado.
export function calcularEvento(inicioIso, finIso, feriados = new Set(), p = PARAMETROS) {
  const ini = absoluto(inicioIso);
  const fin = absoluto(finIso);
  if (fin <= ini) throw new Error('El fin tiene que ser posterior al inicio');

  const diaInicio = Math.floor(ini / MIN_DIA);
  const minInicio = ini - diaInicio * MIN_DIA;

  // Día hábil, arranca entre 07:30 y 17:00: dedicación funcional, aunque se extienda.
  const arrancaEnJornada =
    !esNoLaborable(diaInicio, feriados) &&
    minInicio >= p.entradaMin &&
    minInicio < p.salidaActivacionMin;
  if (arrancaEnJornada) return { tipo: 'dedicacion_funcional', minutosPorDia: {} };

  const minutosPorDia = {};
  for (let dia = diaInicio; dia * MIN_DIA < fin; dia++) {
    const desde = Math.max(ini, dia * MIN_DIA);
    const hasta = Math.min(fin, (dia + 1) * MIN_DIA);
    let contados;
    if (esNoLaborable(dia, feriados)) {
      contados = hasta - desde; // fin de semana o feriado: 0 a 24
    } else if (dia === diaInicio && minInicio >= p.salidaActivacionMin) {
      contados = hasta - desde; // llamado desde las 17:00: hasta la medianoche
    } else {
      // madrugada (o día siguiente de un evento nocturno): solo hasta las 07:30
      contados = Math.max(0, Math.min(hasta, dia * MIN_DIA + p.madrugadaHastaMin) - desde);
    }
    if (contados > 0) minutosPorDia[fechaDeDia(dia)] = contados;
  }
  return { tipo: 'activacion', minutosPorDia };
}

// Minutos de activación de un día completo de una persona -> medias activaciones.
export function mediasDelDia(minutos, p = PARAMETROS) {
  if (minutos <= 0) return 0;
  return minutos <= p.topeMediaMin ? p.valorMedia : p.valorEntera;
}

// participaciones: [{ persona, inicio, fin }]. Suma por persona y por día, y recién
// después aplica el corte de 4:30 (nunca evento por evento).
export function liquidar(participaciones, feriados = new Set(), p = PARAMETROS) {
  const personas = {};
  for (const x of participaciones) {
    const r = calcularEvento(x.inicio, x.fin, feriados, p);
    const ficha = (personas[x.persona] ??= { porDia: {}, eventos: [], totalMedias: 0 });
    ficha.eventos.push({ ...x, tipo: r.tipo });
    for (const [fecha, min] of Object.entries(r.minutosPorDia)) {
      ficha.porDia[fecha] = (ficha.porDia[fecha] ?? 0) + min;
    }
  }
  for (const ficha of Object.values(personas)) {
    const dias = {};
    for (const [fecha, minutos] of Object.entries(ficha.porDia)) {
      const medias = mediasDelDia(minutos, p);
      dias[fecha] = { minutos, medias };
      ficha.totalMedias += medias;
    }
    ficha.porDia = dias;
  }
  return personas;
}
