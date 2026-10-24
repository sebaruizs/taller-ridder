"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function BotonRecibir({ compraId }: { compraId: number }) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [estado, setEstado] = useState<{ ok: boolean; msg: string } | null>(null);

  async function recibir() {
    setEnviando(true);
    setEstado(null);
    try {
      const r = await fetch(`/api/compras/${compraId}/recibir`, { method: "POST" });
      if (r.status === 401) return router.replace("/ingresar");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setEstado({ ok: false, msg: d.error ?? "No se pudo recibir" });
      setEstado(d.aviso ? { ok: false, msg: d.aviso } : { ok: true, msg: "Mercadería recibida: ya entró al stock." });
      setConfirmar(false);
      router.refresh();
    } catch {
      setEstado({ ok: false, msg: "Sin conexión. Revisá en Odoo si se recibió antes de intentar de nuevo." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="card stack" style={{ gap: 10 }}>
      <strong>Falta recibir mercadería</strong>
      {!confirmar ? (
        <button className="btn btn-primary" onClick={() => setConfirmar(true)}>Recibir todo lo pendiente</button>
      ) : (
        <>
          <span className="small">Se valida la recepción en Odoo y la mercadería entra al stock. Confirmá que llegó todo lo pendiente.</span>
          <div className="row">
            <button className="btn" onClick={() => setConfirmar(false)} disabled={enviando}>Cancelar</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={recibir} disabled={enviando}>{enviando ? "Recibiendo en Odoo…" : "Sí, llegó todo"}</button>
          </div>
        </>
      )}
      {estado && <div className={`alert ${estado.ok ? "alert-ok" : "alert-danger"} small`} role="status">{estado.msg}</div>}
    </section>
  );
}
