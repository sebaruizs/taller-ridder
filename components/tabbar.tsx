"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { menuDe, type Pantalla } from "@/lib/permisos";
import { MarcarAsistencia } from "@/components/asistencias";
import { Icono, hrefActivo } from "@/components/sidebar";

// Navegación del celular: pestañas abajo con las mismas pantallas del menú lateral de la PC.
// Solo en las pantallas principales (las listas); en el detalle y los formularios se vuelve con «←»
// y abajo va el botón de la acción. Con una sola pantalla (el mecánico) no hace falta.

const CORTO: Record<string, string> = {
  "/tablero": "Tablero",
  "/ordenes": "Motos",
  "/verificar": "Verificar",
  "/reportes": "Reportes",
  "/inventario": "Productos",
  "/compras": "Compras",
};
const MAXIMO = 5;

export function Tabbar({ pantallas }: { pantallas: Pantalla[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const menu = menuDe(pantallas).filter((p) => p.seccion !== "Configuración");
  const config = [...pantallas.filter((p) => p.seccion === "Configuración"), { href: "/cuenta", nombre: "Mi cuenta" }];
  const [abierto, setAbierto] = useState(false);
  const cajaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (!cajaRef.current?.contains(e.target as Node)) setAbierto(false);
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

  if (menu.length < 2 || !menu.some((p) => p.href === pathname)) return null;

  // Hasta cinco lugares: si no entran todas, las primeras cuatro y «Más» con el resto y la configuración.
  const visibles = menu.slice(0, MAXIMO - 1);
  const resto = menu.slice(MAXIMO - 1);
  const actual = hrefActivo(pathname, menu.map((p) => p.href));

  async function salir() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/ingresar");
    router.refresh();
  }

  return (
    <div className="tabbar-caja" ref={cajaRef}>
      {abierto && (
        <div className="tabbar-mas" id="tabbar-mas">
          {[...resto, ...config].map((p) => (
            <Link key={p.href} href={p.href} className="tabbar-mas-link" aria-current={actual === p.href ? "page" : undefined} onClick={() => setAbierto(false)}>
              {p.nombre}
            </Link>
          ))}
          <MarcarAsistencia className="tabbar-mas-link">Marcar asistencia</MarcarAsistencia>
          <button type="button" className="tabbar-mas-link tabbar-salir" onClick={salir}>
            Salir
          </button>
        </div>
      )}
      <nav className="tabbar" aria-label="Pantallas">
        {visibles.map((p) => (
          <Link key={p.href} href={p.href} className="tab" aria-current={actual === p.href ? "page" : undefined}>
            <Icono href={p.href} />
            <span>{CORTO[p.href] ?? p.nombre}</span>
          </Link>
        ))}
        <button
          type="button"
          className="tab"
          aria-expanded={abierto}
          aria-controls="tabbar-mas"
          data-activa={resto.some((p) => p.href === actual) || undefined}
          onClick={() => setAbierto((a) => !a)}
        >
          <svg className="side-icono" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
          <span>Más</span>
        </button>
      </nav>
    </div>
  );
}
