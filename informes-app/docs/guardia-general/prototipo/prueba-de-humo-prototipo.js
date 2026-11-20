const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/guardia-general-prototipo.html', 'utf8')
  .replace(/<link[^>]*fonts\.googleapis[^>]*>/, '');
const errors = [];
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(w) { w.addEventListener('error', e => errors.push('window.error: ' + (e.error && e.error.stack || e.message))); } });
const w = dom.window, d = w.document;
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FALLA  ' + m); } else console.log('ok     ' + m); };
const click = sel => { const el = d.querySelector(sel); if (!el) throw new Error('No existe ' + sel); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const change = (sel, val) => { const el = d.querySelector(sel); if (!el) throw new Error('No existe ' + sel); el.value = val; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
const setv = (sel, val) => { const el = d.querySelector(sel); if (!el) throw new Error('No existe ' + sel); el.value = val; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const txt = sel => (d.querySelector(sel) || {}).textContent || '';
const totalDe = () => (txt('#office').match(/([\d,]+) activaciones/) || [])[1];
const llamada = (clock) => { // simula la llamada y la registra
  if (clock) change('[data-set="preset"]', clock);
  click('[data-act="simularLlamada"]'); click('#phone [data-act="crearEvento"]');
};
const activarInfra = () => { click('#phone [data-act="toggleAct"][data-a="Infraestructura"]'); click('#phone [data-act="activar"]'); };

// 0) arranque
ok(errors.length === 0, 'carga sin errores de script');
ok(txt('#top').includes('Simular llamada de operación central') && !txt('#top').includes('mail'), 'el circuito arranca con la llamada, sin mail');
ok(txt('#top').includes('Guardia: Mié 16/09 10:00 → Mié 23/09 10:00'), 'semana de guardia en curso (de miércoles 10:00 a miércoles 10:00)');
click('#office [data-act="ofNav"][data-s="liq"]');
const totalIni = totalDe();
ok(totalIni === '7,5', 'liquidación inicial 7,5 (' + totalIni + ')');

// 1) circuito completo: llamada -> aviso al grupo -> SCADA -> activar -> técnico acepta -> cierre
click('[data-act="simularLlamada"]');
ok(txt('#toast').includes('Suena el teléfono') && txt('#toast').includes('Técnico A'), 'suena el teléfono de la guardia general de la semana (Técnico A)');
ok(txt('#phone').includes('Registrar llamada') && txt('#phone').includes('Técnico A · General'), 'el móvil abre la llamada como Técnico A');
ok(d.querySelector('[data-set="form.desc"]').value === 'Falla de arranque', 'la llamada viene con datos de ejemplo');
click('#phone [data-act="crearEvento"]');
ok(txt('#phone').includes('Revisión en el SCADA'), 'después de registrar aparece la revisión en el SCADA');
ok(d.querySelector('#wa-txt').value.includes('Llamada de operación central'), 'el aviso inicial para el grupo ya está armado');
ok(txt('#phone').includes('19:30 – en curso'), 'quedó marcada la hora del llamado (19:30)');
ok(txt('#phone').includes('activación: el llamado entró desde las 17:00'), 'las 19:30 de un día hábil cuenta como activación');
ok(txt('#phone').includes('atendió la llamada'), 'la guardia general queda anotada por atender la llamada');
click('#phone [data-act="scada"][data-v="con_novedad"]');
ok(txt('#phone').includes('hay novedad') && d.querySelector('#wa-txt').value.includes('Revisado en el SCADA'), 'SCADA con novedad: queda en las novedades y listo para el grupo');
click('#phone [data-act="setPedido"][data-v="asistir"]');
activarInfra();
ok(txt('#phone').includes('Se activa la guardia de Infraestructura (Técnico B) para asistir al sitio.'), 'se activa infraestructura: le toca al Técnico B, para asistir');
ok(d.querySelector('#wa-txt').value.includes('Técnico B'), 'el aviso al grupo de la activación está armado');
change('#asu', 'B');
ok(txt('#phone').includes('Te activaron') && txt('#phone').includes('Te piden: asistir al sitio'), 'el Técnico B recibe el aviso con lo que le piden');
click('#phone [data-act="aceptar"][data-m="campo"]');
ok(txt('#phone').includes('en el sitio'), 'B acepta y va al sitio');
click('[data-act="avanzar"][data-min="60"]'); click('[data-act="avanzar"][data-min="60"]');
click('#phone [data-act="terminar"]');
ok(txt('#phone').includes('Técnico B terminó.'), 'B termina');
change('#asu', 'A');
click('#phone [data-act="abrirEvento"]');
d.querySelector('#nov-txt').value = 'Se normaliza el suministro.';
click('#phone [data-act="addNovedad"]');
ok(txt('#phone').includes('Se normaliza el suministro.'), 'novedad agregada');
click('#phone [data-act="waToggle"]');
const wa = d.querySelector('#wa-txt').value;
ok(wa.includes('Guardia activada: Infraestructura') && wa.includes('Se normaliza'), 'resumen completo para el grupo');
click('#phone [data-act="cerrarEvento"]');
ok(txt('#phone').includes('Cerrado'), 'evento cerrado');
click('#office [data-act="ofNav"][data-s="eventos"]');
ok(txt('#office').includes('Mostrando 10 de 10'), 'el evento aparece en la oficina');
click('#office [data-act="ofNav"][data-s="liq"]');
ok(totalDe() !== totalIni, 'la liquidación se recalculó (' + totalIni + ' -> ' + totalDe() + ')');

// 2) camino corto: sin novedad en el SCADA -> cierre
click('[data-act="reiniciar"]');
click('[data-act="simularLlamada"]'); click('#phone [data-act="crearEvento"]');
click('#phone [data-act="scada"][data-v="sin_novedad"]');
ok(txt('#phone').includes('sin novedad') && d.querySelector('#wa-txt').value.includes('sin novedad'), 'SCADA sin novedad: listo para avisar al grupo');
click('[data-act="avanzar"][data-min="30"]');
click('#phone [data-act="cerrarEvento"]');
ok(txt('#phone').includes('Cerrado'), 'sin novedad: se cierra sin activar a nadie');

// 3) reglas horarias con el circuito nuevo
click('[data-act="reiniciar"]');
llamada('2026-09-22T10:00');
ok(txt('#phone').includes('dedicación funcional'), 'martes 10:00 es dedicación funcional');
click('[data-act="reiniciar"]');
llamada('2026-09-23T05:00');
ok(txt('#phone').includes('activación: el llamado entró antes de las 07:30'), 'miércoles 05:00 es activación');
ok(txt('#phone').includes('Técnico A'), 'el miércoles 05:00 todavía atiende la guardia anterior (Técnico A), el cambio es a las 10:00');
click('[data-act="avanzar"][data-min="240"]');
click('#phone [data-act="terminar"]');
click('#office [data-act="ofNav"][data-s="liq"]');
ok(txt('#office').includes('Mié 23/09') && txt('#office').includes('2:30'), 'madrugada 5:00 a 9:00 cuenta 2:30 (hasta 7:30)');

click('[data-act="reiniciar"]');
change('[data-set="preset"]', '2026-09-22T10:00');
click('#phone [data-act="toggleFeriadoHoy"]');
click('[data-act="simularLlamada"]'); click('#phone [data-act="crearEvento"]');
ok(txt('#phone').includes('activación: es fin de semana o feriado'), 'feriado marcado: un día hábil a las 10:00 es activación');

click('[data-act="reiniciar"]');
llamada('2026-09-23T10:30');
ok(txt('#phone').includes('Técnico H'), 'desde las 10:00 del miércoles atiende la guardia general nueva (Técnico H)');

// 4) guardia semanal de miércoles a miércoles 10:00
click('[data-act="reiniciar"]');
llamada('2026-09-22T19:30'); activarInfra();
ok(txt('#phone').includes('Infraestructura (Técnico B)'), 'martes: se avisa al Técnico B (semana del 16)');
click('[data-act="reiniciar"]');
change('[data-set="preset"]', '2026-09-23T05:00');
ok(txt('#top').includes('Guardia: Mié 16/09 10:00'), 'el miércoles 05:00 sigue la semana anterior');
change('[data-set="preset"]', '2026-09-23T10:00');
ok(txt('#top').includes('Guardia: Mié 23/09 10:00 → Mié 30/09 10:00'), 'el miércoles a las 10:00 arranca la semana nueva');
click('[data-act="simularLlamada"]'); click('#phone [data-act="crearEvento"]');
click('#phone [data-act="toggleAct"][data-a="Infraestructura"]'); click('#phone [data-act="toggleAct"][data-a="Datos"]'); click('#phone [data-act="activar"]');
const t4 = txt('#phone');
ok(t4.includes('Infraestructura (Técnico C)') && t4.includes('Datos (Técnico F)'), 'miércoles: se avisa a Técnico C (infra) y Técnico F (datos)');

click('[data-act="reiniciar"]');
click('#office [data-act="ofNav"][data-s="param"]');
setv('[data-set="draft.cambio"]', '08:00'); click('#office [data-act="guardarParams"]');
change('[data-set="preset"]', '2026-09-23T05:00');
ok(txt('#top').includes('Guardia: Mié 16/09 08:00 → Mié 23/09 08:00'), 'con el cambio a las 8:00, el miércoles 05:00 todavía es la semana anterior');

// 5) cronograma anual
click('[data-act="reiniciar"]');
click('#office [data-act="ofNav"][data-s="crono"]');
ok(txt('#office').includes('Cronograma de guardia') && txt('#office').includes('ahora'), 'pantalla de cronograma con la semana actual marcada');
ok(d.querySelector('select[data-crono="2026-09-16|General"]').value === 'A' && d.querySelector('select[data-crono="2026-09-23|General"]').value === 'H', 'la guardia general también rota por semana');
change('#office select[data-crono="2026-09-16|Infraestructura"]', 'C');
llamada('2026-09-22T19:30'); activarInfra();
ok(txt('#phone').includes('Infraestructura (Técnico C)'), 'cambiar el cronograma cambia a quién se avisa');

click('[data-act="reiniciar"]');
click('#office [data-act="ofNav"][data-s="crono"]');
change('#office [data-set="of.cg.anio"]', '2027');
ok(d.querySelector('select[data-crono="2027-09-01|Infraestructura"]').value === '', '2027 todavía no tiene programación');
click('#office [data-act="cgPanel"][data-p="generar"]');
d.querySelector('#gp-anio').value = '2027'; d.querySelector('#gp-area').value = 'Todas';
click('#office [data-act="generarProg"]');
ok(txt('#toast').includes('turnos nuevos'), 'genera la programación de 2027');
ok(d.querySelector('select[data-crono="2027-01-06|Infraestructura"]').value === 'B', 'la rotación sigue desde donde quedó 2026 (continuidad)');
ok(d.querySelectorAll('select[data-crono$="|Datos"]').length >= 52, 'el año completo queda cargado');

// 6) intercambio de guardia (el que no puede, devuelve más adelante)
click('[data-act="reiniciar"]');
click('#office [data-act="ofNav"][data-s="crono"]');
click('#office [data-act="cgPanel"][data-p="cambio"]');
d.querySelector('#cg-de').value = 'B'; d.querySelector('#cg-cubre').value = 'C';
d.querySelector('#cg-d1').value = '2026-09-22'; d.querySelector('#cg-h1').value = '2026-09-22';
d.querySelector('#cg-d2').value = '2026-10-07'; d.querySelector('#cg-h2').value = '2026-10-13';
d.querySelector('#cg-mot').value = 'Licencia';
click('#office [data-act="cambiarGuardia"]');
ok(txt('#office').includes('Licencia') && txt('#office').includes('devolución'), 'el intercambio queda registrado con motivo y devolución');
ok(txt('#office').includes('Esperando respuesta'), 'el cambio queda esperando que el otro asuma');
llamada('2026-09-22T19:30'); activarInfra();
ok(txt('#phone').includes('Infraestructura (Técnico B)'), 'mientras no asuma, sigue B');
click('[data-act="reiniciar"]');
click('#office [data-act="ofNav"][data-s="crono"]');
click('#office [data-act="cgPanel"][data-p="cambio"]');
d.querySelector('#cg-de').value = 'B'; d.querySelector('#cg-cubre').value = 'C';
d.querySelector('#cg-d1').value = '2026-09-22'; d.querySelector('#cg-h1').value = '2026-09-22';
d.querySelector('#cg-d2').value = '2026-10-07'; d.querySelector('#cg-h2').value = '2026-10-13';
d.querySelector('#cg-mot').value = 'Licencia';
click('#office [data-act="cambiarGuardia"]');
change('#asu', 'C');
ok(txt('#phone').includes('Te piden asumir la guardia') && txt('#phone').includes('te devuelve la guardia'), 'a C le llega el aviso con la devolución');
click('#phone [data-act="asumirCambio"]');
ok(txt('#office').includes('Asumió'), 'queda registrado que asumió');
change('#asu', 'A');
llamada('2026-09-22T19:30'); activarInfra();
ok(txt('#phone').includes('Infraestructura (Técnico C)'), 'ya asumió: ese día cubre Técnico C aunque el cronograma diga B');
change('#clk', '2026-10-08T10:00');
click('[data-act="simularLlamada"]'); click('#phone [data-act="crearEvento"]'); activarInfra();
ok(txt('#phone').includes('Infraestructura (Técnico B)'), 'más adelante B devuelve el turno (el 8/10 le toca a B)');
click('#office [data-act="ofNav"][data-s="param"]');
ok(txt('#office').includes('Cambio de guardia · Infraestructura'), 'el cambio también queda en el historial');
click('#office [data-act="ofNav"][data-s="crono"]');
click('#office [data-act="anularCambio"]');
ok(txt('#office').includes('Todavía no hay cambios'), 'anular el cambio borra los dos turnos');
change('#clk', '2026-09-22T19:30');
click('[data-act="simularLlamada"]'); click('#phone [data-act="crearEvento"]'); activarInfra();
ok(txt('#phone').includes('Infraestructura (Técnico B)'), 'anulado: vuelve a regir el cronograma');

// 6b) asumir la guardia cada semana (general y técnicas) y rechazo de un cambio
click('[data-act="reiniciar"]');
change('#clk', '2026-09-23T10:00');
change('#asu', 'H');
ok(txt('#phone').includes('Asumís la guardia') && txt('#phone').includes('General'), 'el miércoles a H (guardia general) le llega «Asumís la guardia»');
click('#phone [data-act="asumirSemana"]');
ok(!txt('#phone').includes('Asumís la guardia'), 'al apretar «Asumo la guardia» el aviso desaparece');
change('#asu', 'C');
ok(txt('#phone').includes('Asumís la guardia') && txt('#phone').includes('Infraestructura'), 'lo mismo para la guardia técnica (C)');
click('[data-act="reiniciar"]');
click('#office [data-act="ofNav"][data-s="crono"]');
click('#office [data-act="cgPanel"][data-p="cambio"]');
d.querySelector('#cg-de').value = 'B'; d.querySelector('#cg-cubre').value = 'C';
d.querySelector('#cg-d1').value = '2026-09-22'; d.querySelector('#cg-h1').value = '2026-09-22';
click('#office [data-act="cambiarGuardia"]');
change('#asu', 'C');
click('#phone [data-act="rechazarCambio"]');
ok(txt('#office').includes('No puede'), 'si C no puede, queda registrado');
change('#asu', 'A');
llamada('2026-09-22T19:30'); activarInfra();
ok(txt('#phone').includes('Infraestructura (Técnico B)'), 'rechazado: sigue B');

// 6c) personas por guardia, calendario y feriados nacionales
click('[data-act="reiniciar"]');
click('#office [data-act="ofNav"][data-s="pers"]');
ok(txt('#office').includes('Personas de guardia') && d.querySelectorAll('#office select[data-pers]').length === 11, 'pantalla Personas con todas las personas');
change('#office select[data-pers="J"]', 'Datos');
ok(txt('#toast').includes('cronograma se rehizo'), 'asignar a J a Datos rehace el cronograma');
click('#office [data-act="ofNav"][data-s="crono"]');
var datos = Array.from(d.querySelectorAll('select[data-crono$="|Datos"]')).map(function(x){ return x.value; });
ok(datos.indexOf('J') >= 0, 'J entra en la rotación de Datos');
ok(d.querySelector('select[data-crono="2026-09-16|Datos"]').value === 'D', 'la semana en curso y las pasadas no se tocan');
click('#office [data-act="ofNav"][data-s="pers"]');
change('#office select[data-pers="J"]', 'Sin guardia');
click('#office [data-act="ofNav"][data-s="crono"]');
ok(Array.from(d.querySelectorAll('select[data-crono$="|Datos"]')).every(function(x){ return x.value !== 'J'; }), 'al sacar a J de la guardia, desaparece del cronograma');
click('#office [data-act="ofNav"][data-s="cal"]');
ok(txt('#office').includes('Calendario de guardia') && txt('#office').includes('Septiembre'), 'calendario del mes de la demo');
ok(d.querySelectorAll('#office .cd[data-f]').length === 30, 'septiembre tiene 30 días');
ok(txt('#office').includes('Inf Técnico B'), 'cada día muestra la guardia de cada área');
click('#office [data-act="calMes"][data-n="1"]');
click('#office [data-act="calMes"][data-n="1"]');
click('#office [data-act="calMes"][data-n="1"]');
ok(txt('#office').includes('Diciembre'), 'se navega de mes');
ok(txt('#office').includes('Feriado nacional sin marcar'), 'diciembre muestra feriados nacionales sin marcar');
click('#office [data-act="cargarFeriados"]');
ok(txt('#toast').includes('Se marcaron 16 feriados'), 'marca los 16 feriados nacionales de 2026');
ok(d.querySelectorAll('#office .cd.fer').length === 2, 'diciembre: 8 y 25 marcados');
click('#office .cd[data-f="2026-12-08"]');
click('#office [data-act="calQuitar"]');
ok(d.querySelectorAll('#office .cd.fer').length === 1, 'se puede quitar un feriado');
click('[data-act="ofNav"][data-s="liq"]');
click('[data-act="reiniciar"]');

// 6d) técnico que no contesta: se llama a otro y lo suyo no cuenta
click('[data-act="reiniciar"]');
llamada('2026-09-22T19:30'); activarInfra();
click('#phone [data-act="noContesta"]');
ok(d.querySelector('#nc-sel') && d.querySelector('#nc-sel').value === 'C', 'ofrece a Técnico C (el otro de infraestructura)');
click('#phone [data-act="llamarOtro"]');
ok(txt('#phone').includes('no contestó') && txt('#phone').includes('Técnico C'), 'queda anotado que B no contestó y se activa a C');
change('#asu', 'C');
ok(txt('#phone').includes('Te activaron'), 'a C le llega el aviso');
change('#asu', 'B');
ok(!txt('#phone').includes('Te activaron'), 'a B ya no le queda el aviso');
click('#office [data-act="ofNav"][data-s="liq"]');
click('#office [data-act="expandir"][data-p="B"]');
ok(!txt('#office').includes('Mar 22/09'), 'lo de B (no contestó) no suma activación');

// 6e) teléfono de cada persona y aviso por WhatsApp a su número
click('[data-act="reiniciar"]');
click('#office [data-act="ofNav"][data-s="pers"]');
change('#office input[data-tel="B"]', '+54 9 11 5555 1234');
ok(txt('#toast').includes('Teléfono guardado'), 'se guarda el teléfono de B');
change('#office input[data-tel="C"]', '123');
ok(txt('#toast').includes('código de país'), 'un teléfono incompleto se rechaza');
llamada('2026-09-22T19:30'); activarInfra();
var aw = d.querySelector('#phone a[href^="https://wa.me/5491155551234"]');
ok(!!aw && decodeURIComponent(aw.getAttribute('href')).includes('Te activaron en la guardia de Infraestructura'), 'el botón WhatsApp abre el chat del número de B con el aviso escrito');
click('[data-act="reiniciar"]');
llamada('2026-09-22T19:30'); activarInfra();
ok(txt('#phone').includes('Sin teléfono'), 'sin teléfono cargado, avisa que falta');

// 7) sin guardia asignada: no se rompe
click('[data-act="reiniciar"]');
change('#clk', '2028-03-15T10:00');
click('[data-act="simularLlamada"]'); click('#phone [data-act="crearEvento"]');
click('#phone [data-act="toggleAct"][data-a="Infraestructura"]'); click('#phone [data-act="activar"]');
ok(txt('#toast').includes('No hay nadie asignado'), 'sin cronograma cargado avisa en vez de romperse');

// 8) parámetros y cierre de período
click('[data-act="reiniciar"]');
click('#office [data-act="ofNav"][data-s="param"]');
setv('[data-set="draft.corte"]', '3:00'); click('#office [data-act="guardarParams"]');
ok(txt('#office').includes('Horas por día hasta las que suma media activación') && txt('#office').includes('03:00'), 'el cambio de parámetro queda en el historial');
click('#office [data-act="ofNav"][data-s="liq"]'); click('#office [data-act="cerrarPeriodo"]');
ok(txt('#office').includes('Período cerrado'), 'cierra el período');
const congelado = totalDe();
click('#office [data-act="ofNav"][data-s="param"]');
setv('[data-set="draft.corte"]', '6:00'); click('#office [data-act="guardarParams"]');
click('#office [data-act="ofNav"][data-s="liq"]');
ok(congelado === totalDe(), 'cambiar un parámetro no mueve el período cerrado (' + congelado + ' = ' + totalDe() + ')');

// 9) reporte de fallas
click('#office [data-act="ofNav"][data-s="fallas"]');
click('#office [data-act="fallaPrueba"]');
ok(txt('#office').includes('APP-01'), 'la falla de prueba queda registrada con código');

ok(errors.length === 0, 'ningún error de script durante todo el recorrido' + (errors.length ? ' -> ' + errors[0] : ''));
console.log(fails ? '\n' + fails + ' fallas' : '\nTodo el circuito pasó');
process.exit(fails ? 1 : 0);
