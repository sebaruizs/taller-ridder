"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { mensajeAcceso } from "@/lib/acceso-mensajes";

// acceso: URL de Ridder Acceso si ACCESO_SOLO está prendido (null = el login de siempre). Con el interruptor, este
// formulario es la entrada de emergencia de los admins; los demás ingresan por Ridder.
export function FormIngresar({ acceso = null }: { acceso?: string | null }) {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El servidor rechazó a alguien que no es admin con ACCESO_SOLO: se muestra el enlace a Ridder junto al error.
  const [irARidder, setIrARidder] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Llegó desde Ridder (/entrar/acceso) y el enlace no sirvió: se dice por qué, arriba del formulario.
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se lee de la URL al montar, no hay otro momento
    setAviso(mensajeAcceso(new URLSearchParams(window.location.search).get("acceso"), !!acceso));
  }, [acceso]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setError(null);
    setIrARidder(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error ?? "No se pudo ingresar");
        if (typeof d.acceso === "string" && /^https?:\/\//.test(d.acceso)) setIrARidder(d.acceso);
        setPassword("");
        return;
      }
      router.replace("/");
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
        <p className="sub">{acceso ? "Entrada de emergencia, solo para administradores." : "Ingresá con tu usuario y contraseña."}</p>
      </div>
      {acceso && (
        <a className="btn btn-primary btn-block btn-lg" href={`${acceso}/ir/taller`}>
          Ingresá por Ridder
        </a>
      )}
      {aviso && <div className="alert alert-warn" role="status">{aviso}</div>}
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
        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
            {irARidder && (
              <>
                {" "}
                <a href={irARidder}>Ir a Ridder</a>
              </>
            )}
          </div>
        )}
        <button className={acceso ? "btn btn-block btn-lg" : "btn btn-primary btn-block btn-lg"} disabled={enviando || !usuario.trim() || !password}>
          {enviando ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
      </div>
    </main>
  );
}
