"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const gs = (n: number) => `Gs. ${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Math.round(n))}`;
const monto = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const conMiles = (s: string) => {
  const n = monto(s);
  return s.trim() === "" || Number.isNaN(n) ? s : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);
};

export function margen(precio: number, costo: number): string | null {
  if (precio <= 0) return null;
  return `${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 }).format(((precio - costo) / precio) * 100)}%`;
}

// Precio de venta que se guarda directo en Odoo. "celda" para la tabla, "kpi" para el detalle.
export function PrecioEditable({
  productoId,
  precio: inicial,
  costo,
  puedeEditar,
  variante,
}: {
  productoId: number;
  precio: number;
  costo: number;
  puedeEditar: boolean;
  variante: "celda" | "kpi";
}) {
  const router = useRouter();
  const [precio, setPrecio] = useState(inicial);
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function abrir() {
    setValor(String(Math.round(precio)));
    setError(null);
    setOk(false);
    setEditando(true);
  }

  async function guardar() {
    const nuevo = monto(valor);
    if (Number.isNaN(nuevo) || nuevo < 0) return setError("Precio inválido");
    if (Math.round(nuevo) === Math.round(precio)) return setEditando(false);
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch(`/api/productos/${productoId}/precio`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ precio: nuevo }),
      });
      if (r.status === 401) return router.replace("/ingresar");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.error ?? "No se pudo guardar");
      setPrecio(d.nuevo);
      setEditando(false);
      setOk(true);
      if (d.aviso) setError(d.aviso);
      router.refresh();
    } catch {
      setError("Sin conexión");
    } finally {
      setGuardando(false);
    }
  }

  const m = margen(precio, costo);

  if (editando) {
    return (
      <form
        className={`precio-edit ${variante}`}
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        <input
          className="input"
          inputMode="numeric"
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Nuevo precio de venta"
          value={conMiles(valor)}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setEditando(false)}
          disabled={guardando}
        />
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-primary" disabled={guardando}>{guardando ? "…" : "Guardar"}</button>
          <button type="button" className="btn" onClick={() => setEditando(false)} disabled={guardando}>Cancelar</button>
        </div>
        {error && <span className="tiny" style={{ color: "var(--danger)" }}>{error}</span>}
      </form>
    );
  }

  if (variante === "celda") {
    return (
      <span className="precio-celda">
        {gs(precio)}
        {puedeEditar && <button type="button" className="precio-lapiz" onClick={abrir} aria-label="Editar precio de venta" title="Editar precio de venta">✎</button>}
        {ok && <span className="tiny" style={{ color: "var(--ok)" }}> ✓</span>}
      </span>
    );
  }

  return (
    <div className="stack" style={{ gap: 4 }}>
      <strong>{gs(precio)}</strong>
      <span className="tiny muted">Margen sobre costo: {m ?? "—"}</span>
      {puedeEditar && <button type="button" className="btn btn-ghost small" style={{ alignSelf: "flex-start", padding: 0, minHeight: 28, color: "var(--ridder)" }} onClick={abrir}>Editar precio</button>}
      {ok && <span className="tiny" style={{ color: "var(--ok)" }}>Guardado en Odoo</span>}
      {error && <span className="tiny" style={{ color: "var(--danger)" }}>{error}</span>}
    </div>
  );
}
