"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { LineaRepuesto } from "@/lib/taller";
import type { ProductoOdoo } from "@/lib/verificar-servicio";

// Carga de repuestos de una orden: la usan Verificar y la sección desplegable de las tarjetas del tablero.

export const gs = (n: number) => `Gs. ${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Math.round(n))}`;
// Costo en guaraníes: el punto es separador de miles. Cantidad: acepta 1,5 o 1.5.
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const cant = (s: string) => Number(s.replace(",", "."));

export function useRepuestos(ordenId: number, iniciales: LineaRepuesto[] | null) {
  const router = useRouter();
  const [lineas, setLineas] = useState<LineaRepuesto[] | null>(iniciales);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sin líneas iniciales (tarjeta del tablero): se leen de Odoo al abrir.
  useEffect(() => {
    if (iniciales) return;
    const ctrl = new AbortController();
    fetch(`/api/ordenes/${ordenId}/repuestos`, { signal: ctrl.signal })
      .then(async (r) => {
        if (r.status === 401) return router.replace("/ingresar");
        const d = await r.json().catch(() => ({}));
        if (r.ok) setLineas(d.lineas);
        else setError(d.error ?? "No se pudieron leer los repuestos");
      })
      .catch((e) => e.name !== "AbortError" && setError("Sin conexión"));
    return () => ctrl.abort();
  }, [ordenId, iniciales, router]);

  async function llamar(url: string, init: RequestInit): Promise<Record<string, unknown> | null> {
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch(url, init);
      if (r.status === 401) {
        router.replace("/ingresar");
        return null;
      }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error ?? "No se pudo guardar");
        return null;
      }
      return d;
    } catch {
      setError("Sin conexión. Probá de nuevo.");
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function agregar(p: { productoId: number; cantidad: number; costoUnitario: number }): Promise<boolean> {
    const d = await llamar(`/api/ordenes/${ordenId}/repuestos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    if (d) setLineas(d.lineas as LineaRepuesto[]);
    return Boolean(d);
  }

  async function quitar(l: LineaRepuesto) {
    if (ocupado || !confirm(`¿Quitar ${l.producto}?`)) return;
    const d = await llamar(`/api/ordenes/${ordenId}/repuestos/${l.id}`, { method: "DELETE" });
    if (d) setLineas(d.lineas as LineaRepuesto[]);
  }

  const total = (lineas ?? []).reduce((s, l) => s + l.total, 0);
  return { lineas, total, ocupado, error, setError, llamar, agregar, quitar };
}

export type EstadoRepuestos = ReturnType<typeof useRepuestos>;

export function ListaRepuestos({ r, editable }: { r: EstadoRepuestos; editable: boolean }) {
  if (r.lineas === null) return <span className="small muted">{r.error ? "" : "Leyendo repuestos de Odoo…"}</span>;
  if (r.lineas.length === 0) return <span className="small muted">Todavía no hay repuestos cargados.</span>;
  return (
    <>
      {r.lineas.map((l) => (
        <div key={l.id} className="row between" style={{ alignItems: "flex-start", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <span style={{ fontWeight: 600 }}>{l.producto}</span>
            <span className="small muted">{l.cantidad} × {gs(l.costoUnitario)} = {gs(l.total)}</span>
          </div>
          {editable && (
            <button type="button" className="btn btn-ghost small" disabled={r.ocupado} onClick={() => r.quitar(l)} aria-label={`Quitar ${l.producto}`}>Quitar</button>
          )}
        </div>
      ))}
    </>
  );
}

export function FormRepuesto({ r, alAgregar, id = "rep" }: { r: EstadoRepuestos; alAgregar?: () => void; id?: string }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<{ q: string; lista: ProductoOdoo[] } | null>(null);
  const [producto, setProducto] = useState<ProductoOdoo | null>(null);
  const [cantidad, setCantidad] = useState("1");
  const [costo, setCosto] = useState("");
  const busqueda = q.trim();

  useEffect(() => {
    if (producto || busqueda.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/productos?q=${encodeURIComponent(busqueda)}`, { signal: ctrl.signal })
        .then((res) => res.json())
        .then((d) => setResultados({ q: busqueda, lista: d.productos ?? [] }))
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [busqueda, producto]);

  function elegir(p: ProductoOdoo) {
    setProducto(p);
    setCosto(String(Math.round(p.costo)));
    setCantidad("1");
  }

  function limpiar() {
    setProducto(null);
    setQ("");
    setResultados(null);
    setCosto("");
    setCantidad("1");
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!producto || r.ocupado) return;
    if (await r.agregar({ productoId: producto.id, cantidad: cant(cantidad), costoUnitario: num(costo || "0") })) {
      limpiar();
      alAgregar?.();
    }
  }

  return (
    <form className="stack" style={{ gap: 12 }} onSubmit={enviar}>
      {producto ? (
        <div className="row between" style={{ alignItems: "flex-start" }}>
          <div className="stack" style={{ gap: 2 }}>
            <span style={{ fontWeight: 600 }}>{producto.nombre}</span>
            <span className="small muted">Costo en Odoo: {gs(producto.costo)}{producto.unidad ? ` por ${producto.unidad}` : ""}</span>
          </div>
          <button type="button" className="btn btn-ghost small" onClick={limpiar}>Cambiar</button>
        </div>
      ) : (
        <div className="field">
          <label htmlFor={`${id}-prod`}>Repuesto</label>
          <input id={`${id}-prod`} className="input" placeholder="Buscar por nombre o código" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
          {resultados?.q === busqueda && resultados.lista.length === 0 && <span className="small muted">No hay repuestos con ese nombre.</span>}
          {resultados?.q === busqueda && resultados.lista.length > 0 && (
            <div className="stack" style={{ gap: 6 }} role="listbox" aria-label="Repuestos encontrados">
              {resultados.lista.map((p) => (
                <button key={p.id} type="button" role="option" aria-selected={false} className="card row between" style={{ textAlign: "left", cursor: "pointer", padding: "10px 12px" }} onClick={() => elegir(p)}>
                  <span>{p.nombre}</span>
                  <span className="small muted" style={{ whiteSpace: "nowrap" }}>{gs(p.costo)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`${id}-cant`}>Cantidad</label>
          <input id={`${id}-cant`} className="input" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 2 }}>
          <label htmlFor={`${id}-costo`}>Costo unitario (Gs.)</label>
          <input id={`${id}-costo`} className="input" inputMode="numeric" value={costo} onChange={(e) => setCosto(e.target.value)} />
        </div>
      </div>
      <button className="btn" disabled={!producto || r.ocupado || !(cant(cantidad) > 0)}>{r.ocupado ? "Guardando en Odoo…" : "Agregar repuesto"}</button>
    </form>
  );
}

// Sección desplegable dentro de una tarjeta del tablero: lee las líneas al abrir y avisa el nuevo total.
export function RepuestosTarjeta({ ordenId, alCambiar }: { ordenId: number; alCambiar: (total: number) => void }) {
  const r = useRepuestos(ordenId, null);
  const { lineas, total } = r;
  useEffect(() => {
    if (lineas) alCambiar(total);
  }, [lineas, total, alCambiar]);
  return (
    <div className="stack tablero-rep" style={{ gap: 10 }}>
      <div className="row between small">
        <strong>Repuestos</strong>
        {lineas && <strong>{gs(total)}</strong>}
      </div>
      <ListaRepuestos r={r} editable />
      <FormRepuesto r={r} id={`rep-${ordenId}`} />
      {r.error && <div className="alert alert-danger small" role="alert">{r.error}</div>}
    </div>
  );
}
