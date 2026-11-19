"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Nombre del producto que se guarda directo en Odoo. "nombre" es el que se muestra; "nombreSolo" el que se edita
// (sin el código que Odoo le pone adelante).
export function NombreEditable({ productoId, nombre, nombreSolo, puedeEditar }: { productoId: number; nombre: string; nombreSolo: string; puedeEditar: boolean }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function abrir() {
    setValor(nombreSolo);
    setError(null);
    setAviso(null);
    setOk(false);
    setEditando(true);
  }

  async function guardar() {
    const nuevo = valor.replace(/\s+/g, " ").trim();
    if (nuevo.length < 3) return setError("Escribí el nombre del producto");
    if (nuevo === nombreSolo) return setEditando(false);
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch(`/api/productos/${productoId}/nombre`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nuevo }),
      });
      if (r.status === 401) return router.replace("/ingresar");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.error ?? "No se pudo guardar");
      setEditando(false);
      setOk(true);
      setAviso(d.aviso ?? null);
      router.refresh();
    } catch {
      setError("Sin conexión. El nombre no se cambió.");
    } finally {
      setGuardando(false);
    }
  }

  if (editando) {
    return (
      <form
        className="nombre-edit"
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        <label className="small muted" htmlFor="nombre-producto">Nombre del producto</label>
        <input
          id="nombre-producto"
          className="input"
          autoFocus
          maxLength={120}
          autoComplete="off"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && !guardando && setEditando(false)}
          disabled={guardando}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "nombre-producto-error" : undefined}
        />
        {error && <span id="nombre-producto-error" className="small" role="alert" style={{ color: "var(--danger)" }}>{error}</span>}
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-primary" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
          <button type="button" className="btn" onClick={() => setEditando(false)} disabled={guardando}>Cancelar</button>
        </div>
        <span className="tiny muted">Se cambia en Odoo y queda anotado en el registro de cambios. Si el producto tiene variantes, cambia en todas.</span>
      </form>
    );
  }

  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="nombre-titulo">
        <h2 style={{ margin: 0, fontSize: 20, overflowWrap: "anywhere" }}>{nombre}</h2>
        {puedeEditar && <button type="button" className="btn btn-ghost small nombre-boton" onClick={abrir}>Editar nombre</button>}
      </div>
      {ok && <span className="tiny" role="status" style={{ color: "var(--ok)" }}>Nombre guardado en Odoo</span>}
      {aviso && <span className="tiny" role="status" style={{ color: "var(--danger)" }}>{aviso}</span>}
    </div>
  );
}
