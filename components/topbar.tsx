"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Rol } from "@/lib/db/schema";

export function Topbar({ titulo, nombre, rol, volver }: { titulo: string; nombre?: string; rol?: Rol; volver?: string }) {
  const router = useRouter();
  async function salir() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/ingresar");
    router.refresh();
  }
  return (
    <header className="topbar">
      <div className="row" style={{ gap: 12, minWidth: 0 }}>
        {volver ? (
          <button className="btn volver" onClick={() => router.push(volver)} aria-label="Volver">←</button>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="logo" src="/brand/ridder-logo.svg" alt="Ridder" />
        )}
        <div style={{ minWidth: 0 }}>
          <h1>{titulo}</h1>
          {nombre && <div className="sub">{nombre}</div>}
        </div>
      </div>
      {nombre && (
        <nav className="row" style={{ gap: 0 }}>
          {rol === "admin" && <Link className="btn btn-ghost small" href="/admin/usuarios">Usuarios</Link>}
          <Link className="btn btn-ghost small" href="/cuenta">Cuenta</Link>
          <button className="btn btn-ghost small" onClick={salir}>Salir</button>
        </nav>
      )}
    </header>
  );
}
