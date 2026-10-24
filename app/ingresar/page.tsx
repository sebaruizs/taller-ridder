"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Ingresar() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error ?? "No se pudo ingresar");
        setPassword("");
        return;
      }
      router.replace("/ordenes");
      router.refresh();
    } catch {
      setError("Sin conexión. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="login-pantalla">
      <div className="login-caja">
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="login-logo" src="/brand/ridder-logo.svg" alt="Ridder" />
        <h1>Taller</h1>
        <p className="sub">Ingresá con tu usuario y contraseña.</p>
      </div>
      <form className="stack" style={{ gap: 14 }} onSubmit={enviar}>
        <div className="field">
          <label htmlFor="usuario">Usuario</label>
          <input
            id="usuario"
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <div className="row" style={{ gap: 8 }}>
            <input
              id="password"
              className="input"
              type={ver ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="button" className="btn" onClick={() => setVer((v) => !v)} aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}>
              {ver ? "Ocultar" : "Ver"}
            </button>
          </div>
        </div>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        <button className="btn btn-primary btn-block btn-lg" disabled={enviando || !usuario.trim() || !password}>
          {enviando ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
      </div>
    </main>
  );
}
