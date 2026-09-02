// Registro del token de push — backend-server usa Firebase Admin
// directo (`enviarPush`, ver lib/push.ts ahí, `messaging().send({token})`),
// no el servicio de push propio de Expo. Por eso acá hace falta
// `getDevicePushTokenAsync()` (el token nativo real, FCM en Android/APNs
// en iOS) y NO `getExpoPushTokenAsync()` (el token del servicio de Expo,
// que backend-server no sabe interpretar).
//
// Nota real: `getDevicePushTokenAsync()` funciona en un build nativo
// (development build / EAS build) — en Expo Go las notificaciones push
// remotas están deshabilitadas desde el SDK 53 (limitación de Expo, no
// de este código). Ver mobile/README.md.
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";

export interface ResultadoPermisoPush {
  ok: boolean;
  token: string | null;
  motivo?: string;
}

export async function pedirPermisoYObtenerToken(): Promise<ResultadoPermisoPush> {
  if (!Device.isDevice) {
    // El simulador/emulador no tiene un servicio de push real detrás.
    return { ok: false, token: null, motivo: "Los push solo funcionan en un dispositivo físico, no en el simulador." };
  }

  const actual = await Notifications.getPermissionsAsync();
  let estado = actual.status;
  if (estado !== "granted") {
    const pedido = await Notifications.requestPermissionsAsync();
    estado = pedido.status;
  }
  if (estado !== "granted") {
    return { ok: false, token: null, motivo: "No se dio permiso de notificaciones — no vas a recibir alertas push (podés seguir viendo tus alertas desde la app)." };
  }

  if (Platform.OS === "android") {
    // Canal requerido en Android 8+ para que la notificación se vea/suene — sin esto, llega pero silenciosa.
    await Notifications.setNotificationChannelAsync("alertas", {
      name: "Alertas de emergencia",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  try {
    const { data } = await Notifications.getDevicePushTokenAsync();
    return { ok: true, token: data };
  } catch (err) {
    return { ok: false, token: null, motivo: err instanceof Error ? err.message : "No se pudo obtener el token de push." };
  }
}
