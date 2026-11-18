import { redirect } from "next/navigation";
import { adondeSinSesion, usuarioActual } from "@/lib/auth";
import { Topbar } from "@/components/topbar";
import { CambiarPassword } from "./cambiar-password";
import { ElegirTema } from "./tema";

export default async function Cuenta() {
  const u = await usuarioActual();
  if (!u) redirect(await adondeSinSesion());
  return (
    <>
      <Topbar titulo="Mi cuenta" volver="/ordenes" />
      <main className="wrap" style={{ paddingTop: 0 }}>
        <div className="stack form-angosto">
          <section className="card stack" style={{ gap: 4 }}>
            <strong>{u.nombre}</strong>
            <span className="small muted">Usuario: {u.usuario}</span>
          </section>
          <ElegirTema inicial={u.tema} />
          <CambiarPassword />
        </div>
      </main>
    </>
  );
}
