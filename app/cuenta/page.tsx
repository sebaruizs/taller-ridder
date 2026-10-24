import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/auth";
import { Topbar } from "@/components/topbar";
import { CambiarPassword } from "./cambiar-password";

export default async function Cuenta() {
  const u = await usuarioActual();
  if (!u) redirect("/ingresar");
  return (
    <>
      <Topbar titulo="Mi cuenta" volver="/ordenes" />
      <main className="wrap stack" style={{ paddingTop: 0 }}>
        <section className="card stack" style={{ gap: 4 }}>
          <strong>{u.nombre}</strong>
          <span className="small muted">Usuario: {u.usuario}</span>
        </section>
        <CambiarPassword />
      </main>
    </>
  );
}
