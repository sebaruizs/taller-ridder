"use client";
import { useRouter } from "next/navigation";

export function Topbar({ titulo, nombre, volver }: { titulo: string; nombre?: string; volver?: string }) {
  const router = useRouter();
  async function salir() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/ingresar");
    router.refresh();
  }
  return (
    <header className="topbar">
      <div className="row" style={{ gap: 4, minWidth: 0 }}>
        {volver && (
          <button className="btn btn-ghost" style={{ padding: "0 10px 0 0" }} onClick={() => router.push(volver)} aria-label="Volver">
            ←
          </button>
        )}
        <div style={{ minWidth: 0 }}>
          <h1>{titulo}</h1>
          {nombre && <div className="small muted">{nombre}</div>}
        </div>
      </div>
      {nombre && (
        <button className="btn btn-ghost small" onClick={salir}>
          Salir
        </button>
      )}
    </header>
  );
}
