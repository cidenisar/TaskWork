import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClientErrorReporter } from "@/components/client-error-reporter";
import { SCRIPT_TEMA_INICIAL } from "@/components/theme-toggle";

const inter = Inter({
  variable: "--font-inter",
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
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${inter.variable}`}>
      <head>
        {/* Antes del primer render: evita el parpadeo del tema oscuro por defecto si el usuario había elegido claro. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_INICIAL }} />
      </head>
      <body>
        <ClientErrorReporter />
        {children}
      </body>
    </html>
  );
}
