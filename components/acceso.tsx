"use client";
import { createContext, useContext } from "react";

// El layout pasa la URL de Ridder Acceso (ACCESO_URL, el ingreso único); vacía = no se muestra ningún enlace.
const AccesoContext = createContext("");

export function AccesoProvider({ url, children }: { url: string; children: React.ReactNode }) {
  return <AccesoContext.Provider value={url}>{children}</AccesoContext.Provider>;
}

// Enlace a Ridder Acceso: sin "ir" va al inicio (los mosaicos); con "ir" abre ese módulo ya ingresado
// (Acceso arma el enlace firmado si la persona tiene sesión allá). Es un <a> porque sale del sitio.
export function EnlaceAcceso({ ir, className, children }: { ir?: "cobranzas" | "asistencias"; className: string; children: React.ReactNode }) {
  const url = useContext(AccesoContext);
  if (!url) return null;
  return <a href={ir ? `${url}/ir/${ir}` : `${url}/`} className={className}>{children}</a>;
}

export function useAcceso(): boolean {
  return !!useContext(AccesoContext);
}
