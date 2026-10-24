"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Persona = { id: number; nombre: string };

const iniciales = (n: string) =>
  n.replace(/[^\p{L}\s]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");

export default function Ingresar() {
  const router = useRouter();
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [elegido, setElegido] = useState<Persona | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    fetch("/api/auth/usuarios")
      .then((r) => r.json())
      .then((d) => setPersonas(d.usuarios ?? []))
      .catch(() => setError("No se pudo cargar la lista. Revisá la conexión."));
  }, []);

  async function enviar(valor: string) {
    if (!elegido || valor.length < 4 || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuarioId: elegido.id, pin: valor }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error ?? "No se pudo ingresar");
        setPin("");
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

  function tecla(k: string) {
    setError(null);
    if (k === "borrar") return setPin((p) => p.slice(0, -1));
    setPin((p) => (p.length < 6 ? p + k : p));
  }

  if (!elegido) {
    return (
      <main className="wrap stack" style={{ paddingTop: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, margin: "0 0 4px", letterSpacing: "-0.02em" }}>Taller Ridder</h1>
          <p className="muted" style={{ margin: 0 }}>Tocá tu nombre para ingresar.</p>
        </div>
        {error && <div className="alert alert-danger">{error}</div>}
        {!personas && !error && <div className="skeleton" />}
        {personas?.length === 0 && <div className="alert alert-warn">Todavía no hay usuarios cargados.</div>}
        <div className="nombres">
          {personas?.map((p) => (
            <button key={p.id} className="nombre" onClick={() => { setElegido(p); setPin(""); }}>
              {p.nombre}
            </button>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="wrap stack" style={{ paddingTop: 24, gap: 20 }}>
      <button className="btn btn-ghost" style={{ alignSelf: "flex-start", paddingLeft: 0 }} onClick={() => { setElegido(null); setError(null); }}>
        ← Cambiar de persona
      </button>
      <div className="stack" style={{ alignItems: "center", gap: 8 }}>
        <div className="avatar" aria-hidden>{iniciales(elegido.nombre)}</div>
        <strong style={{ fontSize: 20 }}>{elegido.nombre}</strong>
        <span className="muted">Ingresá tu PIN</span>
      </div>
      <div className="dots" aria-label={`${pin.length} dígitos ingresados`}>
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <span key={i} className={`dot ${i < pin.length ? "on" : ""}`} />
        ))}
      </div>
      {error && <div className="alert alert-danger center" role="alert">{error}</div>}
      <div className="keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
          <button key={k} className="key" onClick={() => tecla(k)} disabled={enviando}>{k}</button>
        ))}
        <button className="key" style={{ fontSize: 16 }} onClick={() => tecla("borrar")} disabled={enviando} aria-label="Borrar">⌫</button>
        <button className="key" onClick={() => tecla("0")} disabled={enviando}>0</button>
        <button className="key btn-primary" style={{ fontSize: 16 }} onClick={() => enviar(pin)} disabled={enviando || pin.length < 4}>
          {enviando ? "…" : "Entrar"}
        </button>
      </div>
    </main>
  );
}
