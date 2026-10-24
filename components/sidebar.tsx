"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Rol } from "@/lib/db/schema";
import { SECCIONES, type Pantalla } from "@/lib/permisos";

const ROL_NOMBRE: Record<Rol, string> = { mecanico: "Mecánico", jefe: "Jefe de taller", admin: "Admin" };

const activo = (pathname: string, href: string) =>
  href === "/ordenes" ? pathname.startsWith("/ordenes") && !pathname.startsWith("/ordenes/nueva") : pathname.startsWith(href);

// Solo visible en pantallas anchas; en el celular la navegación está en la barra de arriba.
export function Sidebar({ nombre, rol, pantallas }: { nombre: string; rol: Rol; pantallas: Pantalla[] }) {
  const pathname = usePathname();
  const router = useRouter();

  async function salir() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/ingresar");
    router.refresh();
  }

  return (
    <aside className="sidebar">
      <div className="side-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="side-logo" src="/brand/ridder-logo.svg" alt="Ridder" />
        <span>Taller</span>
      </div>
      <nav className="stack" style={{ gap: 14, flex: 1, overflowY: "auto" }} aria-label="Menú">
        {SECCIONES.map((s) => {
          const items = pantallas.filter((p) => p.seccion === s);
          const pronto = s === "Compras";
          if (!items.length && !pronto) return null;
          return (
            <section key={s} className="stack" style={{ gap: 2 }}>
              <h2 className="side-seccion">{s}</h2>
              {items.map((l) => (
                <Link key={l.href} href={l.href} className="side-link" aria-current={activo(pathname, l.href) ? "page" : undefined}>
                  {l.nombre}
                </Link>
              ))}
              {pronto && !items.length && <span className="side-link side-pronto" aria-disabled="true">Próximamente</span>}
            </section>
          );
        })}
      </nav>
      <div className="side-user">
        <div style={{ fontWeight: 600 }}>{nombre}</div>
        <div className="sub">{ROL_NOMBRE[rol]}</div>
        <Link href="/cuenta" className="side-link" style={{ marginTop: 6, paddingLeft: 0 }} aria-current={pathname.startsWith("/cuenta") ? "page" : undefined}>
          Mi cuenta
        </Link>
        <button className="btn btn-block" style={{ marginTop: 6 }} onClick={salir}>Salir</button>
      </div>
    </aside>
  );
}
