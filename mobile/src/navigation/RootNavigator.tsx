// Enrutamiento por estado de la sesión — no hay login, así que no hay
// un "ProtectedRoute" real como en Frontend Web: acá lo que decide qué
// pantalla mostrar es si la sesión ya tiene una `persona` vinculada y,
// si la tiene, su `estado` (mismos 3 casos reales de negocio que ya
// maneja Frontend Web en "Aprobar/rechazar un autoregistro").
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../lib/auth";
import { colors } from "../theme";
import { Cargando } from "../screens/Cargando";
import { Bienvenida } from "../screens/Bienvenida";
import { Reclamar } from "../screens/Reclamar";
import { Codigo } from "../screens/Codigo";
import { CodigoOrganizacion } from "../screens/CodigoOrganizacion";
import { Autoregistro } from "../screens/Autoregistro";
import { EstadoCuenta } from "../screens/EstadoCuenta";
import { Home } from "../screens/Home";
import { Alertas } from "../screens/Alertas";
import { ConfirmarAlerta } from "../screens/ConfirmarAlerta";
import type { AlertaPropia } from "../lib/alertas";
import type { SitioOpcion } from "../lib/registro";

export type RegistroStackParamList = {
  Bienvenida: undefined;
  Reclamar: undefined;
  Codigo: undefined;
  CodigoOrganizacion: undefined;
  Autoregistro: { organizacionNombre: string; sitios: SitioOpcion[] };
};

export type PrincipalStackParamList = {
  Home: undefined;
  Alertas: undefined;
  ConfirmarAlerta: { alerta: AlertaPropia };
};

const RegistroStack = createNativeStackNavigator<RegistroStackParamList>();
const PrincipalStack = createNativeStackNavigator<PrincipalStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

const screenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.text,
  headerTitleStyle: { color: colors.text },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.bg },
};

export function RootNavigator() {
  const { session, persona, cargando, error } = useAuth();

  return (
    <NavigationContainer theme={navTheme}>
      {session === undefined || cargando ? (
        <Cargando error={error} />
      ) : persona === null ? (
        <RegistroStack.Navigator screenOptions={screenOptions}>
          <RegistroStack.Screen name="Bienvenida" component={Bienvenida} options={{ title: "Emergencias Refinería" }} />
          <RegistroStack.Screen name="Reclamar" component={Reclamar} options={{ title: "Ya estoy en el padrón" }} />
          <RegistroStack.Screen name="Codigo" component={Codigo} options={{ title: "Tengo un código" }} />
          <RegistroStack.Screen name="CodigoOrganizacion" component={CodigoOrganizacion} options={{ title: "Soy nuevo" }} />
          <RegistroStack.Screen name="Autoregistro" component={Autoregistro} options={{ title: "Alta de personal nuevo" }} />
        </RegistroStack.Navigator>
      ) : persona.estado !== "activo" ? (
        // pendiente_aprobacion / rechazado / de_baja / vencido — ninguno
        // de estos recibe alertas nuevas (el despacho solo dispara a
        // `estado === 'activo'`, ver backend-server/README.md), así que
        // ninguno debería ver el Home normal como si estuviera cubierto.
        <EstadoCuenta estado={persona.estado} />
      ) : (
        <PrincipalStack.Navigator screenOptions={screenOptions}>
          <PrincipalStack.Screen name="Home" component={Home} options={{ title: "Emergencias Refinería" }} />
          <PrincipalStack.Screen name="Alertas" component={Alertas} options={{ title: "Mis alertas" }} />
          <PrincipalStack.Screen name="ConfirmarAlerta" component={ConfirmarAlerta} options={{ title: "Confirmar estado" }} />
        </PrincipalStack.Navigator>
      )}
    </NavigationContainer>
  );
}
