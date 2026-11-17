import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/auth";
import { pantallasDe } from "@/lib/permisos";
import { Sidebar } from "@/components/sidebar";
import { Tabbar } from "@/components/tabbar";
import { AsistenciasProvider } from "@/components/asistencias";
import { AccesoProvider } from "@/components/acceso";
import { env } from "@/lib/env";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await usuarioActual();
  if (!u) redirect("/ingresar");
  const asistencias = !!(env().ASISTENCIAS_URL && env().ASISTENCIAS_SECRET);
  const acceso = /^https?:\/\//.test(env().ACCESO_URL) ? env().ACCESO_URL.replace(/\/+$/, "") : "";
  return (
    <AccesoProvider url={acceso}>
    <AsistenciasProvider activo={asistencias}>
      <div className="shell">
        <Sidebar nombre={u.nombre} rol={u.rol} pantallas={pantallasDe(u)} />
        <div className="contenido">{children}</div>
        <Tabbar pantallas={pantallasDe(u)} />
      </div>
    </AsistenciasProvider>
    </AccesoProvider>
  );
}
