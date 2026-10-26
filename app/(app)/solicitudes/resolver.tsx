"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Abierta = { id: number; tipo: string | null; fecha: string | null; estado: string };
const ESTADO: Record<string, string> = { new: "Nuevo", running: "En proceso", cancelled: "Listo para verificar" };

export function ResolverSolicitud({ id, chapa, abiertas, aprobadaSinReportar, error }: { id: number; chapa: string; abiertas: Abierta[]; aprobadaSinReportar: boolean; error: string | null }) {
  const router = useRouter();
  const usables = abiertas.filter((o) => o.estado === "new" || o.estado === "running");
  const [destino, setDestino] = useState<string>(usables[0] ? String(usables[0].id) : "nueva");
  const [modo, setModo] = useState<"nada" | "rechazar">("nada");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [estado, setEstado] = useState<{ ok: boolean; msg: string } | null>(error ? { ok: false, msg: error } : null);

  async function llamar(url: string, body: unknown, ok: string) {
    setEnviando(true);
    setEstado(null);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (r.status === 401) return router.replace("/ingresar");
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        if (d?.existentes?.length) setDestino(String(d.existentes[0].id));
        return setEstado({ ok: false, msg: d?.error ?? `Error ${r.status}` });
      }
      setEstado({ ok: true, msg: ok });
      router.refresh();
    } catch {
      setEstado({ ok: false, msg: "Sin conexión. Probá de nuevo: no se duplica." });
    } finally {
      setEnviando(false);
    }
  }

  const aprobar = () =>
    llamar(`/api/solicitudes/${id}/aprobar`, { destino: destino === "nueva" ? "nueva" : Number(destino) }, `${chapa} quedó reportada en Odoo, en «Listo para verificar».`);

  return (
    <div className="stack" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
      {aprobadaSinReportar ? (
        <button className="btn btn-primary" disabled={enviando} onClick={aprobar}>{enviando ? "Reportando en Odoo…" : "Reintentar el reporte en Odoo"}</button>
      ) : modo === "rechazar" ? (
        <>
          <label className="small" htmlFor={`motivo-${id}`}>Motivo (lo ve el mecánico)</label>
          <textarea id={`motivo-${id}`} className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} placeholder="Ej: ese trabajo ya estaba cargado" />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" disabled={enviando} onClick={() => setModo("nada")}>Cancelar</button>
            <button className="btn btn-danger" style={{ flex: 1 }} disabled={enviando || motivo.trim().length < 3} onClick={() => llamar(`/api/solicitudes/${id}/rechazar`, { motivo }, "Solicitud rechazada.")}>
              {enviando ? "Rechazando…" : "Rechazar"}
            </button>
          </div>
        </>
      ) : (
        <>
          {abiertas.length > 0 && (
            <fieldset className="stack small" style={{ gap: 6, border: 0, margin: 0, padding: 0 }}>
              <legend className="small" style={{ marginBottom: 4 }}>Esta moto tiene órdenes abiertas. ¿Dónde se reporta?</legend>
              {abiertas.map((o) => (
                <label key={o.id} className="row" style={{ gap: 8, opacity: o.estado === "cancelled" ? 0.55 : 1 }}>
                  <input type="radio" name={`destino-${id}`} value={o.id} checked={destino === String(o.id)} disabled={o.estado === "cancelled"} onChange={() => setDestino(String(o.id))} />
                  <span>Orden #{o.id} · {ESTADO[o.estado] ?? o.estado}{o.tipo ? ` · ${o.tipo}` : ""}{o.estado === "cancelled" ? " (ya reportada)" : ""}</span>
                </label>
              ))}
              <label className="row" style={{ gap: 8 }}>
                <input type="radio" name={`destino-${id}`} value="nueva" checked={destino === "nueva"} onChange={() => setDestino("nueva")} />
                <span>Crear una orden nueva</span>
              </label>
            </fieldset>
          )}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" disabled={enviando} onClick={() => setModo("rechazar")}>Rechazar</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={enviando} onClick={aprobar}>{enviando ? "Cargando en Odoo…" : "Aprobar"}</button>
          </div>
          <span className="tiny muted">Al aprobar se {destino === "nueva" ? "crea la orden" : "usa esa orden"} y queda reportada a nombre del mecánico, con sus fotos.</span>
        </>
      )}
      {estado && <div className={`alert ${estado.ok ? "alert-ok" : "alert-danger"} small`} role="status">{estado.msg}</div>}
    </div>
  );
}
