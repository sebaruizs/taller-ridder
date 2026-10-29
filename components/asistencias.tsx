"use client";
import { createContext, useContext } from "react";

// El layout dice si Asistencias está configurado (ASISTENCIAS_URL + ASISTENCIAS_SECRET); Sidebar y Topbar muestran el enlace.
const AsistenciasContext = createContext(false);

export function AsistenciasProvider({ activo, children }: { activo: boolean; children: React.ReactNode }) {
  return <AsistenciasContext.Provider value={activo}>{children}</AsistenciasContext.Provider>;
}

// Enlace a la web de Asistencias ya logueado. Es un <a> y no un <Link> porque sale del sitio (el server redirige con un link firmado).
export function MarcarAsistencia({ className, children = "Marcar asistencia" }: { className: string; children?: React.ReactNode }) {
  const activo = useContext(AsistenciasContext);
  if (!activo) return null;
  return <a href="/api/asistencias/marcar" className={className}>{children}</a>;
}
