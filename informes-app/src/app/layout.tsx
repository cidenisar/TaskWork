import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ClientErrorReporter } from "@/components/client-error-reporter";
import { SCRIPT_TEMA_INICIAL } from "@/components/theme-toggle";

// Letra de la imagen "Mezcla" (10/11/2026). Reemplaza a Inter.
const fuente = Plus_Jakarta_Sans({
  variable: "--font-app",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "TaskWork",
  description: "Informe Técnico y Rendición de Gastos para técnicos de campo",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TaskWork",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b2a5b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: el script del <head> agrega `data-theme="dark"` antes de hidratar.
    // Sin esto React toma la diferencia como error de hidratación, re-renderiza desde el cliente
    // y borra el atributo: el tema oscuro se perdía al recargar (guía de Next "preventing flash").
    <html lang="es" className={`${fuente.variable}`} suppressHydrationWarning>
      <head>
        {/* Antes del primer render: evita el parpadeo del tema claro por defecto si el usuario había elegido oscuro. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_INICIAL }} />
      </head>
      <body>
        <ClientErrorReporter />
        {children}
      </body>
    </html>
  );
}
