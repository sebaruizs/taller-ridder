import { leerHistorial } from "@/lib/historial";

const inicial = (n: string) => n.trim().charAt(0).toUpperCase() || "?";

export async function Historial({ ordenId }: { ordenId: number }) {
  const entradas = await leerHistorial(ordenId).catch(() => null);
  return (
    <section className="card stack" style={{ gap: 12 }} aria-label="Historial de la orden">
      <div className="row between">
        <strong>Historial</strong>
        <span className="tiny muted">Igual que en Odoo</span>
      </div>
      {entradas === null && <span className="small muted">No se pudo leer el historial de Odoo.</span>}
      {entradas?.length === 0 && <span className="small muted">Todavía no hay movimientos.</span>}
      {entradas?.map((e) => (
        <article key={e.id} className="row historial-item" style={{ alignItems: "flex-start", gap: 10 }}>
          <span className="historial-avatar" aria-hidden>{inicial(e.autor)}</span>
          <div className="stack" style={{ gap: 3, minWidth: 0 }}>
            <div className="small">
              <strong>{e.autor}</strong> <span className="muted">{e.fecha}</span>
            </div>
            {e.texto && <div className="small" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{e.texto}</div>}
            {e.cambios.map((c, i) => (
              <div key={i} className="small">
                • {c.de} → <strong style={{ color: "var(--ridder)" }}>{c.a}</strong> <span className="muted">({c.campo})</span>
              </div>
            ))}
            {e.adjuntos > 0 && <div className="small muted">📎 {e.adjuntos === 1 ? "1 adjunto" : `${e.adjuntos} adjuntos`}</div>}
          </div>
        </article>
      ))}
    </section>
  );
}
