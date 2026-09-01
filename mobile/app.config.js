// app.config.js en vez de app.json (mismo contenido, forma dinámica) — hace
// falta poder leer `process.env` para resolver `googleServicesFile` a la
// ruta que EAS Build escribe en disco cuando esa variable está configurada
// como "file" (ver DESPLIEGUE-REAL.md, sección 10, y
// https://docs.expo.dev/eas/environment-variables/#file-environment-variables).
// En local, sin esa variable, cae al archivo de siempre (./google-services.json,
// gitignoreado — ver README, sección "Push").
module.exports = {
  expo: {
    name: "Emergencias Refinería",
    slug: "emergencias-refineria-mobile",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: "emergencias-refineria",
    userInterfaceStyle: "dark",
    backgroundColor: "#0a0e13",
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.emergenciasrefineria.mobile",
      infoPlist: {
        UIBackgroundModes: ["remote-notification"],
      },
    },
    android: {
      package: "com.emergenciasrefineria.mobile",
      adaptiveIcon: {
        backgroundColor: "#0a0e13",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      [
        "expo-notifications",
        {
          color: "#ff8c2b",
        },
      ],
    ],
    // Vinculado con `eas init` (ver DESPLIEGUE-REAL.md) — fijo acá para que
    // clonar el repo de nuevo en otra máquina no pida re-vincular el proyecto.
    extra: {
      eas: {
        projectId: "32e05d28-a5e3-4c63-868c-092b1c4ebc32",
      },
    },
  },
};
