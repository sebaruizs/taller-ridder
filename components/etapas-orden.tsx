"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { movimientoValido } from "@/lib/taller";

const ETAPAS = [
  { estado: "new", titulo: "Nuevo" },
  { estado: "to_be_paid", titulo: "Bloqueado" },
  { estado: "running", titulo: "En proceso" },
  { estado: "cancelled", titulo: "Listo para verificar" },
  { estado: "done", titulo: "Finalizado" },
] as const;

type Estado = (typeof ETAPAS)[number]["estado"];
export type AccionesEtapas = { iniciar: boolean; finalizar: boolean; verificar: boolean };

// Los mismos movimientos que el tablero: los directos (también volver atrás) cambian la etapa acá mismo;
// pasar a Listo para verificar abre el reporte y a Finalizado, la verificación.
function destino(de: Estado, a: Estado, acc: AccionesEtapas): "directo" | "reporte" | "verificar" | null {
  if (de === "running" && a === "cancelled") return acc.finalizar ? "reporte" : null;
  if (de === "cancelled" && a === "done") return acc.verificar ? "verificar" : null;
  return movimientoValido(de, a) && acc.iniciar ? "directo" : null;
}

// Etapas de la orden, arriba a la derecha del detalle: la actual marcada y las alcanzables se tocan para cambiar.
export function EtapasOrden({ ordenId, estado, acciones }: { ordenId: number; estado: string; acciones: AccionesEtapas }) {
  const router = useRouter();
  const [moviendo, setMoviendo] = useState<Estado | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cambiar(a: Estado) {
    const d = destino(estado as Estado, a, acciones);
    if (!d || moviendo) return;
    if (d === "reporte") return router.push(`/ordenes/${ordenId}/finalizar`);
    if (d === "verificar") return router.push(`/verificar/${ordenId}`);
    setMoviendo(a);
    setError(null);
    try {
      const r = await fetch(`/api/ordenes/${ordenId}/mover`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ de: estado, a }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setError(j.error ?? "No se pudo cambiar la etapa");
      else if (j.aviso) setError(j.aviso);
      router.refresh();
    } catch {
      setError("Sin conexión. Probá de nuevo.");
    } finally {
      setMoviendo(null);
    }
  }

  return (
    <div className="etapas-caja">
      <div className="etapas" role="group" aria-label="Etapa de la orden">
        {ETAPAS.map((e) => {
          const actual = e.estado === estado;
          const puede = !actual && destino(estado as Estado, e.estado, acciones) !== null;
          return (
            <button
              key={e.estado}
              type="button"
              className="etapa"
              aria-current={actual ? "step" : undefined}
              data-disponible={puede || undefined}
              disabled={!puede || moviendo !== null}
              onClick={() => cambiar(e.estado)}
              title={puede ? `Pasar a ${e.titulo}` : undefined}
            >
              {moviendo === e.estado ? "Moviendo…" : e.titulo}
            </button>
          );
        })}
      </div>
      {error && <div className="alert alert-danger small" role="alert">{error}</div>}
    </div>
  );
}
