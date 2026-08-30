import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { AuthProvider } from "./src/lib/auth";
import { RootNavigator } from "./src/navigation/RootNavigator";

// Mostrar la notificación (con banner y sonido) incluso con la app
// abierta en primer plano — sin esto, expo-notifications la trata como
// "silenciosa" mientras la app está al frente, y una alerta de
// emergencia no debería depender de que el usuario tenga la app
// cerrada para enterarse.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
