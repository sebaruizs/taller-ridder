"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ColoresReporte } from "@/lib/ajustes-dominio";

const num = (s: string) => Number(s.replace(",", "."));

// Colores del último reporte del GPS: hasta cuántas horas es verde y desde cuántas es rojo.
export function FormAjustes({ inicial }: { inicial: ColoresReporte }) {
  const router = useRouter();
  const [amarillo, setAmarillo] = useState(String(inicial.amarilloDesdeHoras));
  const [rojo, setRojo] = useState(String(inicial.rojoDesdeHoras));
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; msg: string } | null>(null);
  const a = num(amarillo);
  const r = num(rojo);
  const valido = a > 0 && r > a;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!valido || guardando) return;
    setGuardando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/admin/ajustes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colores: { amarilloDesdeHoras: a, rojoDesdeHoras: r } }),
      });
      if (res.status === 401) return router.replace("/ingresar");
      const d = await res.json().catch(() => ({}));
      setAviso(res.ok ? { ok: true, msg: "Se guardaron los colores." } : { ok: false, msg: d.error ?? "No se pudo guardar" });
    } catch {
      setAviso({ ok: false, msg: "Sin conexión. Probá de nuevo." });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <main className="wrap">
      <form className="stack form-angosto" style={{ gap: 14 }} onSubmit={guardar}>
        <section className="card stack" style={{ gap: 12 }}>
          <strong>Colores del último reporte del GPS</strong>
          <span className="small muted">Cómo se pinta «hace cuánto» reportó cada equipo en las tarjetas del GPS y del tablero.</span>
          <div className="field">
            <label htmlFor="c-amarillo">Amarillo desde (horas)</label>
            <input id="c-amarillo" className="input" inputMode="decimal" value={amarillo} onChange={(e) => setAmarillo(e.target.value)} style={{ maxWidth: 160 }} />
          </div>
          <div className="field">
            <label htmlFor="c-rojo">Rojo desde (horas)</label>
            <input id="c-rojo" className="input" inputMode="decimal" value={rojo} onChange={(e) => setRojo(e.target.value)} style={{ maxWidth: 160 }} />
            <span className="small muted">24 h = 1 día. Tiene que ser más que el de amarillo.</span>
          </div>
          <div className="ajustes-colores">
            <span className="ajuste-color" data-color="verde">Verde</span>
            <span className="small">menos de {a || "…"} h</span>
            <span className="ajuste-color" data-color="amarillo">Amarillo</span>
            <span className="small">de {a || "…"} h a {r || "…"} h</span>
            <span className="ajuste-color" data-color="rojo">Rojo</span>
            <span className="small">{r || "…"} h o más</span>
          </div>
          {!valido && <span className="small" style={{ color: "var(--danger)" }}>El de rojo tiene que ser mayor que el de amarillo, y los dos mayores a 0.</span>}
        </section>
        {aviso && <div className={`alert ${aviso.ok ? "alert-ok" : "alert-danger"}`} role="status">{aviso.msg}</div>}
        <div className="bottom-bar">
          <div className="accion-corta">
            <button className="btn btn-primary btn-block btn-lg" disabled={!valido || guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
          </div>
        </div>
      </form>
    </main>
  );
}
