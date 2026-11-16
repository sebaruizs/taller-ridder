"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Borra una devolución con sus fotos, después de confirmar acá mismo (solo admin).
export function BorrarDevolucion({ id, chapa }: { id: number; chapa: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function borrar() {
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch(`/api/devoluciones/${id}`, { method: "DELETE" });
      if (r.status === 401) return router.replace("/ingresar");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.error ?? "No se pudo borrar");
      router.refresh();
    } catch {
      setError("Sin conexión. Probá de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  if (!confirmando) {
    return (
      <button type="button" className="btn btn-ghost small devolucion-borrar" onClick={() => setConfirmando(true)}>
        Borrar
      </button>
    );
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <span className="small">¿Borrar la recepción de {chapa} con sus fotos? No se puede deshacer.</span>
      <div className="row">
        <button type="button" className="btn" disabled={ocupado} onClick={() => setConfirmando(false)}>Cancelar</button>
        <button type="button" className="btn btn-peligro" disabled={ocupado} onClick={borrar}>{ocupado ? "Borrando…" : "Sí, borrar"}</button>
      </div>
      {error && <div className="alert alert-danger small" role="alert">{error}</div>}
    </div>
  );
}
