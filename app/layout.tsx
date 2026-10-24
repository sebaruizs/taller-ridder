import type { Metadata, Viewport } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import { RegistrarSW } from "@/components/registrar-sw";
import "./globals.css";

const sans = Inter_Tight({ variable: "--font-sans", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: "Taller Ridder",
  description: "Órdenes de taller de Ridder",
  applicationName: "Taller Ridder",
  appleWebApp: { capable: true, title: "Taller", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#F4F3EF",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-PY" className={`${sans.variable} ${mono.variable}`}>
      <body>
        {children}
        <RegistrarSW />
      </body>
    </html>
  );
}
