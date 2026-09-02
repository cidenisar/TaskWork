// Asignación de pines — ESP32 DevKit WROOM-32 (38 pines), ver artefacto
// Cowork "Cableado ESP32–Pi" (esquema + tabla de conexionado). El
// diagrama fija la TOPOLOGÍA (11 entradas: 10 botones + llave; 9 salidas:
// 8 lámparas a ULN2803A + 1 relé) y deja explícitamente como pendiente
// "confirmar el pinout exacto de tu placa" — este archivo es esa
// asignación concreta, pensada para que sea lo único que haya que tocar
// si el pinout real de tu módulo difiere.
//
// --- El presupuesto de pines no cierra con los "seguros" solos ---
//
// GPIOs expuestos en un DevKit de 38 pines: 26. Descontando lo que el
// propio esquema pide evitar (GPIO0/2/12/15 — strapping de arranque — y
// GPIO6-11 — flash interna, ni siquiera están expuestos) quedan 22.
// Reservando UART2 para el enlace con la Pi (GPIO16/17, pines por
// defecto del Serial2 del core Arduino-ESP32) quedan 18. Hacen falta 20
// señales (11 entradas + 9 salidas) — faltan 2.
//
// De esos 18: GPIO34/35/36/39 son solo-entrada (sin pull-up interno, hay
// que agregarles resistencia externa a 3.3V — la única desviación de
// "sin componentes extra" del esquema, y solo para 4 de los 11 botones).
// Los otros 14 son de uso general (entrada o salida, con pull-up
// interno).
//
// Para cerrar el déficit de 2 sin tocar los pines de arranque/flash que
// el esquema pide evitar explícitamente, se reutiliza UART0 (GPIO1/3 —
// el mismo enlace serie que usa el conversor USB de la placa para
// flashear/depurar) como 2 salidas de lámpara más. Esto es un
// compromiso conocido y común en proyectos ESP32 con pocos GPIO
// disponibles: se pierde el monitor serie por USB en producción a
// cambio de 2 pines. Con DEBUG_SERIAL definido (ver platformio.ini) el
// firmware hace lo contrario — libera esos 2 pines para depuración por
// USB y deshabilita LAMP_PROG4 y RELE (quedan sin pinMode/digitalWrite,
// ver aviso en el log al arrancar). Para el armado final, sin
// DEBUG_SERIAL, las 8 lámparas y el relé funcionan completos.
//
// Todo esto es una propuesta razonada, NO un pinout confirmado contra
// hardware real (no hay un ESP32 en este entorno de desarrollo, ver
// esp32-firmware/README.md). Antes de armar el gabinete: verificar en
// banco de pruebas que ninguna de estas asignaciones choca con algo
// específico de tu módulo exacto (algunos DevKit "clones" no exponen
// todos los pines de la lista, o reservan alguno para un LED/botón de
// placa).

#pragma once

// --- UART hacia la Raspberry Pi (Serial2, protocolo en protocolo.h) ---
// Pines por defecto del Serial2 en el core Arduino-ESP32 — no hace falta
// remapear. Datos únicamente (3.3V↔3.3V, sin conversor de nivel — la Pi
// también trabaja a 3.3V en sus GPIO), GND común aparte (ver esquema).
#define PIN_UART_PI_RX 16
#define PIN_UART_PI_TX 17

// --- Entradas: contacto de cada botón + llave, INPUT_PULLUP → GND ---
// (pulsado/habilitado = nivel BAJO; ver `esLlaveHabilitada` en main.cpp
// para el sentido exacto que se le dio al selector — no confirmado
// contra el ZB4 real, ver README).
#define PIN_BOTON_INCENDIO 4
#define PIN_BOTON_SISMO 5
#define PIN_BOTON_MEDICO 13
#define PIN_BOTON_TOXICO 14
#define PIN_BOTON_OK 18
#define PIN_BOTON_CANCELAR 19
#define PIN_LLAVE 21

// PROG1–4: pines solo-entrada del ESP32 (34/35/36/39) — sin pull-up
// interno, requieren resistencia externa a 3.3V (10kΩ, una por pin)
// entre el pin y 3.3V; el botón sigue yendo del pin a GND como los
// demás. Única desviación de "sin componentes extra" del esquema — ver
// nota de presupuesto de pines arriba.
#define PIN_BOTON_PROG1 34
#define PIN_BOTON_PROG2 35
#define PIN_BOTON_PROG3 36
#define PIN_BOTON_PROG4 39

// --- Salidas: 8 lámparas (→ ULN2803A, activo en ALTO) + 1 relé ---
// Orden de canales del ULN2803A tal cual la tabla de conexionado del
// esquema (INCENDIO=OUT1 ... PROG4=OUT8) — el orden lógico entre estos
// #define y qué borne físico del ULN2803A es cada uno se resuelve al
// cablear, no le importa a este firmware.
#define PIN_LAMPARA_INCENDIO 22
#define PIN_LAMPARA_SISMO 23
#define PIN_LAMPARA_MEDICO 25
#define PIN_LAMPARA_TOXICO 26
#define PIN_LAMPARA_PROG1 27
#define PIN_LAMPARA_PROG2 32
#define PIN_LAMPARA_PROG3 33

#ifndef DEBUG_SERIAL
// Build "de producción" (ver platformio.ini) — UART0 reclamado para la
// octava lámpara y el relé, ver nota de presupuesto arriba.
#define PIN_LAMPARA_PROG4 1
#define PIN_RELE 3
#else
// Build de depuración — UART0 libre para Serial (USB), PROG4 y el relé
// quedan deshabilitados a propósito (ver aviso en Serial al arrancar).
#define LAMPARA_PROG4_DESHABILITADA
#define RELE_DESHABILITADO
#endif
