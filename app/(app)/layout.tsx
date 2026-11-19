import { redirect } from "next/navigation";
import { adondeSinSesion, usuarioActual } from "@/lib/auth";
import { pantallasDe } from "@/lib/permisos";
import { Sidebar } from "@/components/sidebar";
import { Tabbar } from "@/components/tabbar";
import { AsistenciasProvider } from "@/components/asistencias";
import { AccesoProvider } from "@/components/acceso";
import { env } from "@/lib/env";
import { esSoloLectura } from "@/lib/solo-lectura";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await usuarioActual();
  // Sin sesión: al login propio o, con ACCESO_SOLO, a Ridder Acceso con la ruta de vuelta.
  if (!u) redirect(await adondeSinSesion());
  const asistencias = !!(env().ASISTENCIAS_URL && env().ASISTENCIAS_SECRET);
  const acceso = /^https?:\/\//.test(env().ACCESO_URL) ? env().ACCESO_URL.replace(/\/+$/, "") : "";
  return (
    <AccesoProvider url={acceso}>
    <AsistenciasProvider activo={asistencias}>
      <div className="shell">
        <Sidebar nombre={u.nombre} rol={u.rol} pantallas={pantallasDe(u)} />
        <div className="contenido">
          {esSoloLectura(u.rol) && <div className="alert alert-warn small" role="status" style={{ margin: "12px 16px 0" }}>Cuenta de solo lectura: podés ver todo, pero no se guardan cambios.</div>}
          {children}
        </div>
        <Tabbar pantallas={pantallasDe(u)} />
      </div>
    </AsistenciasProvider>
    </AccesoProvider>
  );
}
