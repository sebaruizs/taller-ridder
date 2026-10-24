import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { RegistrarSW } from "@/components/registrar-sw";
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
