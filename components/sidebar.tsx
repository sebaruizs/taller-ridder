"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Rol } from "@/lib/db/schema";
import { SECCIONES, type Pantalla } from "@/lib/permisos";

const ROL_NOMBRE: Record<Rol, string> = { mecanico: "Mecánico", jefe: "Jefe de taller", admin: "Admin" };

// Marca la opción más específica: en "/inventario/nuevo" se marca "Nuevo producto", no "Productos".
function hrefActivo(pathname: string, hrefs: string[]): string | null {
  const coinciden = hrefs.filter((h) => pathname === h || pathname.startsWith(h + "/"));
  return coinciden.sort((a, b) => b.length - a.length)[0] ?? null;
}

// Solo visible en pantallas anchas; en el celular la navegación está en la barra de arriba.
export function Sidebar({ nombre, rol, pantallas }: { nombre: string; rol: Rol; pantallas: Pantalla[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const actual = hrefActivo(pathname, [...pantallas.map((p) => p.href), "/cuenta"]);
  const config = [...pantallas.filter((p) => p.seccion === "Configuración"), { href: "/cuenta", nombre: "Mi cuenta" }];
  const [abierto, setAbierto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

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
          if (!items.length) return null;
          return (
            <section key={s} className="stack" style={{ gap: 2 }}>
              <h2 className="side-seccion">{s}</h2>
              {items.map((l) => (
                <Link key={l.href} href={l.href} className="side-link" aria-current={actual === l.href ? "page" : undefined}>
                  {l.nombre}
                </Link>
              ))}
            </section>
          );
        })}
      </nav>
      <div className="side-user">
        <div className="side-user-fila" ref={menuRef}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{nombre}</div>
            <div className="sub">{ROL_NOMBRE[rol]}</div>
          </div>
          <button
            type="button"
            className="side-config"
            aria-label="Configuración"
            aria-haspopup="menu"
            aria-expanded={abierto}
            data-activo={config.some((c) => c.href === actual) || undefined}
            onClick={() => setAbierto((a) => !a)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          {abierto && (
            <div className="side-menu" role="menu">
              {config.map((c) => (
                <Link key={c.href} href={c.href} role="menuitem" className="side-link" aria-current={actual === c.href ? "page" : undefined} onClick={() => setAbierto(false)}>
                  {c.nombre}
                </Link>
              ))}
            </div>
          )}
        </div>
        <button className="btn btn-block" style={{ marginTop: 10 }} onClick={salir}>Salir</button>
      </div>
    </aside>
  );
}
