"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Borra la orden en Odoo, después de confirmar. Vuelve al tablero.
export function EliminarOrden({ ordenId, chapa }: { ordenId: number; chapa: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function eliminar() {
    if (ocupado || !confirm(`¿Eliminar la orden #${ordenId} de ${chapa}? Se borra en Odoo con sus repuestos y no se puede deshacer.`)) return;
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch(`/api/ordenes/${ordenId}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "No se pudo eliminar la orden");
      router.replace("/tablero");
      router.refresh();
    } catch (e) {
      setError((e as Error).message || "Sin conexión. Probá de nuevo.");
      setOcupado(false);
    }
  }

  return (
    <>
      <button className="btn btn-peligro" onClick={eliminar} disabled={ocupado} style={{ alignSelf: "flex-start" }}>
        {ocupado ? "Eliminando…" : "Eliminar orden"}
      </button>
      {error && <div className="alert alert-danger small" role="alert">{error}</div>}
    </>
  );
}
