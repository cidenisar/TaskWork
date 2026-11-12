import type { UnifilarCircuito } from "@/lib/tableros/unifilar";

/**
 * Fixture de desarrollo para probar el motor de unifilares fuera de Next.js
 * (ver scripts/probar-unifilar.ts) — NUNCA se importa desde la app en
 * producción, solo desde scripts de este directorio.
 *
 * Base: los 53 circuitos REALES de "Tablero de Prueba 11" (REFINERIA LUJAN
 * DE CUYO, proyecto Supabase "Informes"), traídos con una query puntual
 * durante esta sesión — ya cubren: cadena térmica→disyuntor, patrón "grupo"
 * (la térmica general N°1 alimenta ~26 circuitos directos), un circuito
 * 380v_tri (N°1/2) y un descargador_gaseoso (N°3).
 *
 * Síntesis agregada al final (numero 54+, sin padre real en el tablero):
 * cubre lo que ese tablero real NO tenía — bypass UPS (3 térmicas
 * entrada/bypass/salida), una bornera, una bornera_fusible y una fuente
 * industrial — para que el fixture ejercite TODAS las ramas del motor
 * que el plan de reescritura necesita validar.
 */
export const FIXTURE_UNIFILAR: UnifilarCircuito[] = [
  { numero: 1, texto: "INTERRUPTOR GRAL.", categoriaEquipo: "termica", tipoCircuito: "380v_tri", ampNominal: null, cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: null, etiquetaCable: null },
  { numero: 2, texto: "PROTEC. SOBRETENS. ATMOSF. - INTERRUPTOR", categoriaEquipo: "termica", tipoCircuito: "380v_tri", ampNominal: null, cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 3, texto: "PROTEC. SOBRETENS. ATMOSF. - DESCARGADOR", categoriaEquipo: "descargador_gaseoso", tipoCircuito: "380v_tri", ampNominal: null, cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: null, etiquetaCable: null },
  { numero: 4, texto: "C.C.T.V. - INT. DIFER.", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 5, texto: "C.C.T.V. - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 4, etiquetaCable: null },
  { numero: 6, texto: "CONTROL ACCESO - INT. DIFER.", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 7, texto: "CONTROL ACCESO - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 6, etiquetaCable: null },
  { numero: 8, texto: "RACK Nº 01 / ILUMINACION EMERGENCIA - INT. DIFER.", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 9, texto: "RACK Nº 01 / ILUMINACION EMERGENCIA - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 8, etiquetaCable: null },
  { numero: 10, texto: "RACK Nº 02 / CKT 2 - INT. DIFER.", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 11, texto: "RACK Nº 02 / CKT 2 - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 10, etiquetaCable: null },
  { numero: 12, texto: "RACK Nº 03 / CKT 3 - INT. DIFER.", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 13, texto: "RACK Nº 03 / CKT 3 - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 12, etiquetaCable: null },
  { numero: 14, texto: "RACK Nº 04 / CKT 4 - INT. DIFER.", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 15, texto: "RACK Nº 04 / CKT 4 - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 14, etiquetaCable: null },
  { numero: 16, texto: "RACK Nº 05 / CKT 5 - INT. DIFER.", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 17, texto: "RACK Nº 05 / CKT 5 - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 16, etiquetaCable: null },
  { numero: 18, texto: "RACK Nº 06 / CKT 6 - INT. DIFER.", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 19, texto: "RACK Nº 06 / CKT 6 - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 18, etiquetaCable: null },
  { numero: 20, texto: "CKT 7 - INT. DIFER. (cartel negro de destino en blanco)", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 21, texto: "CKT 7 - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 20, etiquetaCable: null },
  { numero: 22, texto: "RACK Nº 08 / CKT 8 - INT. DIFER.", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 23, texto: "RACK Nº 08 / CKT 8 - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 22, etiquetaCable: null },
  { numero: 24, texto: "RACK Nº 09 / CKT 9 - INT. DIFER.", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 25, texto: "RACK Nº 09 / CKT 9 - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 24, etiquetaCable: null },
  { numero: 26, texto: "RACK Nº 10 / CKT 10 - INT. DIFER.", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 27, texto: "RACK Nº 10 / CKT 10 - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 26, etiquetaCable: null },
  { numero: 28, texto: "CENTRAL DE INCENDIO - INT. DIFER.", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 29, texto: "CENTRAL DE INCENDIO - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 28, etiquetaCable: null },
  { numero: 30, texto: "OFICINA Nº 02 / CKT 13 - INT. DIFER.", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 31, texto: "OFICINA Nº 02 / CKT 13 - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 30, etiquetaCable: null },
  { numero: 32, texto: "OFICINA Nº 03 / CKT 14 - INT. DIFER.", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 33, texto: "OFICINA Nº 03 / CKT 14 - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 32, etiquetaCable: null },
  { numero: 34, texto: "BALIZA - INT. DIFER.", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 35, texto: "BALIZA - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 34, etiquetaCable: null },
  { numero: 36, texto: "RACK 8 / CKT 15 - INT. DIFER.", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 37, texto: "RACK 8 / CKT 15 - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 36, etiquetaCable: null },
  { numero: 38, texto: "RACK 8 / CKT 16 - INT. DIFER.", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 39, texto: "RACK 8 / CKT 16 - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 38, etiquetaCable: null },
  { numero: 40, texto: "RAD. PARÁB. ASO - INT. DIFER.", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 41, texto: "RAD. PARÁB. ASO - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 40, etiquetaCable: null },
  { numero: 42, texto: "RESERVA / CKT 11 - INT. DIFER.", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 43, texto: "RESERVA / CKT 11 - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 42, etiquetaCable: null },
  { numero: 44, texto: "RESERVA / CKT 12 - INT. DIFER.", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 45, texto: "RESERVA / CKT 12 - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 44, etiquetaCable: null },
  { numero: 46, texto: "TNX TETRA - diferencial Merlin Gerin ID si", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: null, cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 47, texto: "TNX TETRA - térmica Merlin Gerin C60N", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 46, etiquetaCable: null },
  { numero: 48, texto: "RACK 7 / CKT 17 - diferencial ID", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "40A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 49, texto: "RACK 7 / CKT 17 - térmica 2P palanca naranja", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 48, etiquetaCable: null },
  { numero: 50, texto: "RACK 7 / CKT 18 - diferencial ID", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "40A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 51, texto: "RACK 7 / CKT 18 - térmica 2P palanca naranja", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 50, etiquetaCable: null },
  { numero: 52, texto: "ESTACION CALIDAD DE AIRE - diferencial ID", categoriaEquipo: "disyuntor", tipoCircuito: "220v_mono", ampNominal: "25A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 53, texto: "ESTACION CALIDAD DE AIRE - térmica iC60N", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "10A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 52, etiquetaCable: null },

  // --- Síntesis agregada: lo que Tablero de Prueba 11 no tenía ---
  // Bypass UPS: 3 térmicas del mismo calibre, sin disyuntor (ver G3/G5 de REGLAS_UNIFILAR.md),
  // alimentando un circuito de carga aguas abajo de S.UPS.
  { numero: 54, texto: "ENTRADA UPS", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "32A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: "entrada", padreNumero: null, etiquetaCable: null },
  { numero: 55, texto: "BYPASS UPS", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "32A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: "bypass", padreNumero: null, etiquetaCable: null },
  { numero: 56, texto: "SALIDA UPS", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "32A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: "salida", padreNumero: null, etiquetaCable: null },
  { numero: 57, texto: "RACK Nº 11 / CKT 19 - INT. TERMOM.", categoriaEquipo: "termica", tipoCircuito: "220v_mono", ampNominal: "16A", cuerpo: null, alimentadoPorUps: true, rolBypassUps: null, padreNumero: 56, etiquetaCable: null },

  // Bornera / bornera_fusible / fuente industrial sueltas (sin térmica propia, salen directo de la barra general).
  { numero: 58, texto: "BORNERA SALIDA GENERAL", categoriaEquipo: "bornera", tipoCircuito: "na", ampNominal: null, cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
  { numero: 59, texto: "BORNERA CON FUSIBLE 24V", categoriaEquipo: "bornera_fusible", tipoCircuito: "24vdc", ampNominal: null, cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: null, etiquetaCable: "BNR-02" },
  { numero: 60, texto: "FUENTE 24V RACK 01", categoriaEquipo: "fuente_industrial", tipoCircuito: "220v_mono", ampNominal: "10A", cuerpo: null, alimentadoPorUps: false, rolBypassUps: null, padreNumero: 1, etiquetaCable: null },
];
