import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await usuarioActual();
  if (!u) redirect("/ingresar");
  return (
    <div className="shell">
      <Sidebar nombre={u.nombre} rol={u.rol} />
      <div className="contenido">{children}</div>
    </div>
  );
}
