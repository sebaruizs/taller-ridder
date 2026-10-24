"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Rol } from "@/lib/db/schema";

const ROL_NOMBRE: Record<Rol, string> = { mecanico: "Mecánico", jefe: "Jefe de taller", admin: "Admin" };

const activo = (pathname: string, href: string) =>
  href === "/ordenes" ? pathname.startsWith("/ordenes") && !pathname.startsWith("/ordenes/nueva") : pathname.startsWith(href);

// Solo visible en pantallas anchas; en el celular la navegación está en la barra de arriba.
export function Sidebar({ nombre, rol, pantallas }: { nombre: string; rol: Rol; pantallas: { href: string; nombre: string }[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const links = [...pantallas.map((p) => ({ href: p.href, label: p.nombre })), { href: "/cuenta", label: "Mi cuenta" }];

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
      <nav className="stack" style={{ gap: 2, flex: 1 }}>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="side-link" aria-current={activo(pathname, l.href) ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="side-user">
        <div style={{ fontWeight: 600 }}>{nombre}</div>
        <div className="sub">{ROL_NOMBRE[rol]}</div>
        <button className="btn btn-block" style={{ marginTop: 10 }} onClick={salir}>Salir</button>
      </div>
    </aside>
  );
}
