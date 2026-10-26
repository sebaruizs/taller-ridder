import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { RegistrarSW } from "@/components/registrar-sw";
import { usuarioActual } from "@/lib/auth";
import type { Tema } from "@/lib/db/schema";
import "./globals.css";

const sans = Inter({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: "Taller Ridder",
  description: "Órdenes de taller de Ridder",
  applicationName: "Taller Ridder",
  icons: { icon: [{ url: "/brand/ridder-isotipo.svg", type: "image/svg+xml" }] },
  appleWebApp: { capable: true, title: "Taller", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0a1a3a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const DATA_THEME: Record<Tema, string> = { claro: "light", oscuro: "dark", sistema: "system" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Sin sesión (pantalla de ingreso) también es claro.
  const tema = (await usuarioActual())?.tema ?? "claro";
  return (
    <html lang="es-PY" className={`${sans.variable} ${mono.variable}`} data-theme={DATA_THEME[tema]}>
      <body>
        {children}
        <RegistrarSW />
      </body>
    </html>
  );
}
