"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Acciones de la orden arriba a la derecha del detalle, como en Odoo. Las mismas del tablero:
// los cambios directos usan /api/ordenes/<id>/mover; reportar y verificar abren su formulario.
type Estado = "new" | "to_be_paid" | "running" | "cancelled" | "done";

export function AccionesOrden({
  ordenId,
  estado,
  puede,
}: {
  ordenId: number;
  estado: string;
  puede: { mover: boolean; finalizar: boolean; verificar: boolean };
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mover(de: Estado, a: Estado) {
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch(`/api/ordenes/${ordenId}/mover`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ de, a }) });
      if (r.status === 401) return router.replace("/ingresar");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.error ?? "No se pudo mover la orden");
      router.refresh();
    } catch {
      setError("Sin conexión. Probá de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  const botones: React.ReactNode[] = [];
  if (estado === "new" && puede.mover)
    botones.push(<button key="iniciar" type="button" className="btn btn-primary" disabled={ocupado} onClick={() => mover("new", "running")}>Pasar a En proceso</button>);
  if (estado === "running" && puede.finalizar)
    botones.push(<Link key="reporte" className="btn btn-primary" href={`/ordenes/${ordenId}/finalizar`}>Cargar reporte</Link>);
  if (estado === "running" && puede.mover)
    botones.push(<button key="bloquear" type="button" className="btn" disabled={ocupado} onClick={() => mover("running", "to_be_paid")}>Pasar a Bloqueado</button>);
  if (estado === "to_be_paid" && puede.mover)
    botones.push(<button key="volver" type="button" className="btn btn-primary" disabled={ocupado} onClick={() => mover("to_be_paid", "running")}>Volver a En proceso</button>);
  if (estado === "cancelled" && puede.verificar)
    botones.push(<Link key="verificar" className="btn btn-primary" href={`/verificar/${ordenId}`}>Verificar</Link>);

  if (!botones.length) return null;
  return (
    <div className="orden-acciones">
      <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>{botones}</div>
      {error && <span className="small" role="alert" style={{ color: "var(--danger)" }}>{error}</span>}
    </div>
  );
}
