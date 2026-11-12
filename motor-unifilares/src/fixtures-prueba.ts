/**
 * Tableros chicos para probar la pantalla /probar sin tener que escribir
 * JSON a mano — cada uno ejercita un patrón real distinto (ver
 * REGLAS_UNIFILAR.md): cadena simple, patrón "grupo" (un nodo con varios
 * hijos → PD-n), y trifásico con bypass de UPS. A propósito con pocos
 * circuitos (5-8): el costo de generarlos con la IA es una fracción del
 * de un tablero real completo, para iterar barato (ver CRITERIOS_Y_IDEAS.md).
 */
import type { RotuloUnifilar, UnifilarCircuito } from "./types.js";

export interface FixturePrueba {
  id: string;
  nombre: string;
  descripcion: string;
  circuitos: UnifilarCircuito[];
}

export const ROTULO_PRUEBA: RotuloUnifilar = {
  sitio: "Sitio de prueba",
  tablero: "TS-PRUEBA",
  cliente: "Cliente de prueba",
  contratista: "TaskWork",
  fecha: new Date().toISOString().slice(0, 10),
  realizo: "Prueba automática",
  numeroGeneracion: "0",
};

const cadenaSimple: UnifilarCircuito[] = [
  { numero: 1, texto: "Térmica general", categoriaEquipo: "termica", tipoCircuito: "na", ampNominal: "40A", cuerpo: "C1", alimentadoPorUps: false, rolBypassUps: null, padreNumero: null, etiquetaCable: null },
  { numero: 2, texto: "Disyuntor cámara entrada", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: "C1", alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: "A1" },
  { numero: 3, texto: "Cámara CCTV entrada", categoriaEquipo: "camara", tipoCircuito: "220v_mono", ampNominal: null, cuerpo: "C1", alimentadoPorUps: false, rolBypassUps: null, padreNumero: 2, etiquetaCable: "A2" },
];

const patronGrupo: UnifilarCircuito[] = [
  { numero: 1, texto: "Térmica general distribución", categoriaEquipo: "termica", tipoCircuito: "na", ampNominal: "63A", cuerpo: "C1", alimentadoPorUps: false, rolBypassUps: null, padreNumero: null, etiquetaCable: null },
  { numero: 2, texto: "Disyuntor cámara 1", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "10A", cuerpo: "C1", alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: "A1" },
  { numero: 3, texto: "Cámara CCTV 1", categoriaEquipo: "camara", tipoCircuito: "220v_mono", ampNominal: null, cuerpo: "C1", alimentadoPorUps: false, rolBypassUps: null, padreNumero: 2, etiquetaCable: "A2" },
  { numero: 4, texto: "Disyuntor cámara 2", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "10A", cuerpo: "C1", alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: "A3" },
  { numero: 5, texto: "Cámara CCTV 2", categoriaEquipo: "camara", tipoCircuito: "220v_mono", ampNominal: null, cuerpo: "C1", alimentadoPorUps: false, rolBypassUps: null, padreNumero: 4, etiquetaCable: "A4" },
  { numero: 6, texto: "Disyuntor lectora acceso", categoriaEquipo: "disyuntor", tipoCircuito: "12vdc", ampNominal: "6A", cuerpo: "C1", alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: "A5" },
  { numero: 7, texto: "Lectora de acceso", categoriaEquipo: "lectora", tipoCircuito: "12vdc", ampNominal: null, cuerpo: "C1", alimentadoPorUps: false, rolBypassUps: null, padreNumero: 6, etiquetaCable: "A6" },
];

const trifasicoBypassUps: UnifilarCircuito[] = [
  { numero: 1, texto: "Entrada UPS", categoriaEquipo: "termica", tipoCircuito: "380v_tri", ampNominal: "32A", cuerpo: "C1", alimentadoPorUps: false, rolBypassUps: "entrada", padreNumero: null, etiquetaCable: null },
  { numero: 2, texto: "Bypass UPS", categoriaEquipo: "termica", tipoCircuito: "380v_tri", ampNominal: "32A", cuerpo: "C1", alimentadoPorUps: false, rolBypassUps: "bypass", padreNumero: null, etiquetaCable: null },
  { numero: 3, texto: "Salida UPS", categoriaEquipo: "termica", tipoCircuito: "380v_tri", ampNominal: "32A", cuerpo: "C1", alimentadoPorUps: true, rolBypassUps: "salida", padreNumero: null, etiquetaCable: null },
  { numero: 4, texto: "Disyuntor rack principal", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "20A", cuerpo: "C1", alimentadoPorUps: true, rolBypassUps: null, padreNumero: 3, etiquetaCable: "A1" },
  { numero: 5, texto: "Bornera salida rack", categoriaEquipo: "bornera", tipoCircuito: "220v_mono", ampNominal: null, cuerpo: "C1", alimentadoPorUps: true, rolBypassUps: null, padreNumero: 4, etiquetaCable: "A2" },
];

export const FIXTURES_PRUEBA: FixturePrueba[] = [
  { id: "cadena_simple", nombre: "Cadena simple (3 circuitos)", descripcion: "Térmica → disyuntor → cámara, un solo destino.", circuitos: cadenaSimple },
  { id: "patron_grupo", nombre: 'Patrón "grupo" (7 circuitos)', descripcion: "Una térmica general alimentando 3 ramas independientes (dispara PD-n).", circuitos: patronGrupo },
  { id: "trifasico_bypass_ups", nombre: "Trifásico + bypass UPS (5 circuitos)", descripcion: "Entrada/bypass/salida de UPS en 380V tri + una rama de salida.", circuitos: trifasicoBypassUps },
];
