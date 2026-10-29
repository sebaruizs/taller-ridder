import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/auth";
import { pantallasDe } from "@/lib/permisos";
import { Sidebar } from "@/components/sidebar";
import { AsistenciasProvider } from "@/components/asistencias";
import { env } from "@/lib/env";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await usuarioActual();
  if (!u) redirect("/ingresar");
  const asistencias = !!(env().ASISTENCIAS_URL && env().ASISTENCIAS_SECRET);
  return (
    <AsistenciasProvider activo={asistencias}>
      <div className="shell">
        <Sidebar nombre={u.nombre} rol={u.rol} pantallas={pantallasDe(u)} />
        <div className="contenido">{children}</div>
      </div>
    </AsistenciasProvider>
  );
}
