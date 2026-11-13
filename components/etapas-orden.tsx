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

// Etapa de la orden en su detalle: dice en cuál está y, abajo, un botón por cada etapa a la que se puede pasar.
export function EtapasOrden({ ordenId, estado, acciones }: { ordenId: number; estado: string; acciones: AccionesEtapas }) {
  const router = useRouter();
  const [moviendo, setMoviendo] = useState<Estado | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; msg: string } | null>(null);
  const titulo = (e: string) => ETAPAS.find((x) => x.estado === e)?.titulo ?? e;
  const destinos = ETAPAS.filter((e) => e.estado !== estado && destino(estado as Estado, e.estado, acciones) !== null);
  const indice = ETAPAS.findIndex((e) => e.estado === estado);

  async function cambiar(a: Estado) {
    const d = destino(estado as Estado, a, acciones);
    if (!d || moviendo) return;
    if (d === "reporte") return router.push(`/ordenes/${ordenId}/finalizar`);
    if (d === "verificar") return router.push(`/verificar/${ordenId}`);
    setMoviendo(a);
    setAviso(null);
    try {
      const r = await fetch(`/api/ordenes/${ordenId}/mover`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ de: estado, a }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) return router.replace("/ingresar");
      if (!r.ok) setAviso({ ok: false, msg: j.error ?? "No se pudo cambiar la etapa" });
      else setAviso(j.aviso ? { ok: false, msg: j.aviso } : { ok: true, msg: `La orden pasó a «${titulo(a)}».` });
      router.refresh();
    } catch {
      setAviso({ ok: false, msg: "Sin conexión. Probá de nuevo." });
    } finally {
      setMoviendo(null);
    }
  }

  return (
    <div className="etapas-caja">
      <div className="etapas-actual">
        <span className="small muted">Etapa</span>
        <span className="etapa-actual">{titulo(estado)}</span>
      </div>
      {destinos.length > 0 && (
        <div className="etapas" role="group" aria-label="Mover la orden a otra etapa">
          <span className="small muted">Mover a</span>
          {destinos.map((e) => {
            const atras = ETAPAS.findIndex((x) => x.estado === e.estado) < indice;
            return (
              <button key={e.estado} type="button" className="etapa" data-atras={atras || undefined} disabled={moviendo !== null} onClick={() => cambiar(e.estado)}>
                {moviendo === e.estado ? "Moviendo…" : `${atras ? "←" : "→"} ${e.titulo}`}
              </button>
            );
          })}
        </div>
      )}
      {aviso && <div className={`alert small ${aviso.ok ? "alert-ok" : "alert-danger"}`} role={aviso.ok ? "status" : "alert"}>{aviso.msg}</div>}
    </div>
  );
}
