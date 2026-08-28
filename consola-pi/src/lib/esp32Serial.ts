// Apertura del puerto serie real hacia el ESP32 — ver backend-server/README,
// "Cableado ESP32–Pi": UART a 3 hilos (TX/RX/GND), sin alimentación
// compartida. Separado de esp32.ts para que ese archivo (el protocolo en
// sí) se pueda testear sin tocar hardware ni el paquete `serialport`.

import { SerialPort } from "serialport";

export function abrirPuertoEsp32(path: string, baudRate: number): SerialPort {
  return new SerialPort({ path, baudRate });
}
