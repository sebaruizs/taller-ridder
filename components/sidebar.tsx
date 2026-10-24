"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Rol } from "@/lib/db/schema";

const ROL_NOMBRE: Record<Rol, string> = { mecanico: "Mecánico", jefe: "Jefe de taller", admin: "Admin" };

// Solo visible en pantallas anchas; en el celular la navegación está en la barra de arriba.
export function Sidebar({ nombre, rol }: { nombre: string; rol: Rol }) {
  const pathname = usePathname();
  const router = useRouter();
  const links = [
    { href: "/ordenes", label: "Motos en proceso" },
    ...(rol === "admin" ? [{ href: "/admin/usuarios", label: "Usuarios" }] : []),
    { href: "/cuenta", label: "Mi cuenta" },
  ];

  async function salir() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/ingresar");
    router.refresh();
  }

  return (
    <aside className="sidebar">
      <div className="row" style={{ gap: 10, padding: "4px 8px 20px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={32} height={32} style={{ borderRadius: 8 }} />
        <strong style={{ fontSize: 18, letterSpacing: "-0.02em" }}>Taller Ridder</strong>
      </div>
      <nav className="stack" style={{ gap: 2 }}>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="side-link" aria-current={pathname.startsWith(l.href) ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="side-user">
        <div style={{ fontWeight: 600 }}>{nombre}</div>
        <div className="small muted">{ROL_NOMBRE[rol]}</div>
        <button className="btn btn-block" style={{ marginTop: 10 }} onClick={salir}>Salir</button>
      </div>
    </aside>
  );
}
