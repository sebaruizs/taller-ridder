"use client";
import { useState } from "react";

export function CambiarPassword() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [estado, setEstado] = useState<{ ok: boolean; msg: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setEstado(null);
    try {
      const r = await fetch("/api/cuenta/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actual, nueva }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setEstado({ ok: false, msg: d.error ?? "No se pudo cambiar" });
      setActual("");
      setNueva("");
      setEstado({ ok: true, msg: "Listo, tu contraseña cambió. Se cerró la sesión en tus otros dispositivos." });
    } catch {
      setEstado({ ok: false, msg: "Sin conexión. Probá de nuevo." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="card stack" style={{ gap: 12 }} onSubmit={enviar}>
      <strong>Cambiar contraseña</strong>
      <div className="field">
        <label htmlFor="actual">Contraseña actual</label>
        <input id="actual" className="input" type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="nueva">Nueva contraseña</label>
        <input id="nueva" className="input" type="password" autoComplete="new-password" minLength={8} placeholder="Mínimo 8 caracteres" value={nueva} onChange={(e) => setNueva(e.target.value)} required />
      </div>
      {estado && <div className={`alert ${estado.ok ? "alert-ok" : "alert-danger"}`} role="status">{estado.msg}</div>}
      <button className="btn btn-primary" disabled={enviando}>{enviando ? "Guardando…" : "Cambiar contraseña"}</button>
    </form>
  );
}
