// Arma el contenido del push/SMS de un evento — pura, sin I/O (ver
// test/despacho.test.ts). El canal (push vs. SMS) ya lo decide
// `canalDePersona` en logic/eventos.ts; esto solo arma el texto. El envío
// real vive en lib/push.ts / lib/sms.ts, orquestado por lib/despachador.ts.

export interface MensajeDespacho {
  titulo: string;
  cuerpo: string;
  textoSms: string;
  data: Record<string, string>;
}

/**
 * Redacción de primera versión — no viene de ninguna ficha (no hay una que
 * defina copy de mensajes). Fácil de ajustar después: todo el texto vive
 * acá, en un solo lugar.
 *
 * `escenario` es la narrativa puntual de un simulacro (ver
 * SimulacroProgramado.escenario, ej. "se rompió una válvula, hay derrame
 * de líquido tóxico en Zona B") — si viene, se suma al mensaje; si no
 * (evento real, o simulacro sin escenario cargado), el mensaje queda
 * genérico como antes.
 */
export function armarMensajeDespacho(params: {
  eventoId: string;
  tipoEvento: string;
  sitioId: string;
  sitioNombre: string;
  escenario?: string | null;
}): MensajeDespacho {
  const titulo = `🚨 ${params.tipoEvento} — ${params.sitioNombre}`;
  const instruccion = "Diríjase a un punto de encuentro y confirme su estado en la app.";
  const cuerpo = params.escenario ? `${params.escenario} ${instruccion}` : instruccion;
  const textoSms = params.escenario
    ? `ALERTA ${params.tipoEvento} en ${params.sitioNombre}. ${params.escenario} ${instruccion}`
    : `ALERTA ${params.tipoEvento} en ${params.sitioNombre}. ${instruccion}`;
  return {
    titulo,
    cuerpo,
    textoSms,
    data: { eventoId: params.eventoId, tipo: params.tipoEvento, sitioId: params.sitioId },
  };
}
