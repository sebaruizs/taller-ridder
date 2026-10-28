"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LineaRepuesto } from "@/lib/taller";
import type { ProductoOdoo } from "@/lib/verificar-servicio";

// «Repuestos utilizados», como la lista de Odoo: una fila por repuesto, editable en el lugar,
// y «Agregar una línea» al final. La usan Finalizar, Verificar y el detalle de la orden.

export const gs = (n: number) => `Gs. ${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Math.round(n))}`;
const miles = (n: number) => new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(n);
// Costo en guaraníes: el punto es separador de miles. Cantidad: acepta 1,5 o 1.5.
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const cant = (s: string) => Number(s.replace(",", "."));

type Datos = { cantidad: number; costoUnitario: number };

export function useRepuestos(ordenId: number, iniciales: LineaRepuesto[]) {
  const router = useRouter();
  const [lineas, setLineas] = useState<LineaRepuesto[]>(iniciales);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function guardar(url: string, method: string, body?: unknown): Promise<boolean> {
    const d = await llamar(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    if (d) setLineas(d.lineas as LineaRepuesto[]);
    return Boolean(d);
  }

  const base = `/api/ordenes/${ordenId}/repuestos`;
  const agregar = (p: Datos & { productoId: number }) => guardar(base, "POST", p);
  const editar = (l: LineaRepuesto, p: Datos) => guardar(`${base}/${l.id}`, "PATCH", p);
  async function quitar(l: LineaRepuesto) {
    if (ocupado || !confirm(`¿Quitar ${l.producto}?`)) return;
    await guardar(`${base}/${l.id}`, "DELETE");
  }

  const total = lineas.reduce((s, l) => s + l.total, 0);
  return { lineas, total, ocupado, error, llamar, agregar, editar, quitar };
}

export type EstadoRepuestos = ReturnType<typeof useRepuestos>;

export function CajaRepuestos({ ordenId, lineasIniciales, editable }: { ordenId: number; lineasIniciales: LineaRepuesto[]; editable: boolean }) {
  const r = useRepuestos(ordenId, lineasIniciales);
  return <TablaRepuestos r={r} editable={editable} />;
}

export function TablaRepuestos({ r, editable, alAgregar, conError = true }: { r: EstadoRepuestos; editable: boolean; alAgregar?: () => void; conError?: boolean }) {
  const [agregando, setAgregando] = useState(false);
  const columnas = editable ? 6 : 5;
  return (
    <section className="card stack repuestos-caja" style={{ gap: 0 }}>
      <strong className="repuestos-titulo">Repuestos utilizados</strong>
      <div className="tabla-scroll">
        <table className="tabla repuestos-tabla">
          <thead>
            <tr>
              <th>Producto</th>
              <th className="num">Utilizado</th>
              <th>UdM</th>
              <th className="num">Costo unitario</th>
              <th className="num">Total</th>
              {editable && <th aria-label="Quitar" />}
            </tr>
          </thead>
          <tbody>
            {r.lineas.map((l) => (editable ? <FilaEditable key={`${l.id}-${l.cantidad}-${l.costoUnitario}`} l={l} r={r} /> : <FilaLectura key={l.id} l={l} />))}
            {r.lineas.length === 0 && !agregando && (
              <tr>
                <td colSpan={columnas} className="small muted">Todavía no hay repuestos cargados.</td>
              </tr>
            )}
            {editable &&
              (agregando ? (
                <FilaNueva
                  r={r}
                  cerrar={() => setAgregando(false)}
                  alAgregar={() => {
                    setAgregando(false);
                    alAgregar?.();
                  }}
                />
              ) : (
                <tr>
                  <td colSpan={columnas}>
                    <button type="button" className="repuestos-agregar" onClick={() => setAgregando(true)} disabled={r.ocupado}>
                      Agregar una línea
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {conError && r.error && <div className="alert alert-danger small" role="alert" style={{ margin: "10px 0 0" }}>{r.error}</div>}
      <div className="repuestos-total">
        {r.ocupado && <span className="small muted">Guardando en Odoo… · </span>}
        <span className="muted">Total costo repuestos:</span> <strong>{gs(r.total)}</strong>
      </div>
    </section>
  );
}

function FilaLectura({ l }: { l: LineaRepuesto }) {
  return (
    <tr>
      <td>{l.producto}</td>
      <td className="num">{miles(l.cantidad)}</td>
      <td>{l.unidad ?? ""}</td>
      <td className="num">{miles(l.costoUnitario)}</td>
      <td className="num">{miles(l.total)}</td>
    </tr>
  );
}

// Cantidad y costo se editan en la misma fila; se guarda al salir del campo o con Enter.
function FilaEditable({ l, r }: { l: LineaRepuesto; r: EstadoRepuestos }) {
  const [cantidad, setCantidad] = useState(String(l.cantidad).replace(".", ","));
  const [costo, setCosto] = useState(miles(l.costoUnitario));
  const c = cant(cantidad);
  const u = num(costo || "0");
  const cambio = c !== l.cantidad || u !== l.costoUnitario;

  function guardar() {
    if (!cambio || r.ocupado) return;
    if (!(c > 0) || !(u >= 0)) {
      setCantidad(String(l.cantidad).replace(".", ","));
      setCosto(miles(l.costoUnitario));
      return;
    }
    void r.editar(l, { cantidad: c, costoUnitario: u });
  }
  const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  return (
    <tr data-cambio={cambio || undefined}>
      <td>{l.producto}</td>
      <td className="num">
        <input className="celda num" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} onBlur={guardar} onKeyDown={alTeclear} aria-label={`Cantidad de ${l.producto}`} />
      </td>
      <td>{l.unidad ?? ""}</td>
      <td className="num">
        <input className="celda num" inputMode="numeric" value={costo} onChange={(e) => setCosto(e.target.value)} onBlur={guardar} onKeyDown={alTeclear} aria-label={`Costo unitario de ${l.producto}`} />
      </td>
      <td className="num">{miles(cambio && c > 0 ? c * u : l.total)}</td>
      <td className="num">
        <button type="button" className="repuestos-quitar" disabled={r.ocupado} onClick={() => r.quitar(l)} aria-label={`Quitar ${l.producto}`} title="Quitar">
          🗑
        </button>
      </td>
    </tr>
  );
}

// «Agregar una línea»: buscar el producto en la misma fila, como en Odoo.
function FilaNueva({ r, cerrar, alAgregar }: { r: EstadoRepuestos; cerrar: () => void; alAgregar: () => void }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<{ q: string; lista: ProductoOdoo[] } | null>(null);
  const [producto, setProducto] = useState<ProductoOdoo | null>(null);
  const [cantidad, setCantidad] = useState("1");
  const [costo, setCosto] = useState("");
  const cantRef = useRef<HTMLInputElement>(null);
  const busqueda = q.trim();
  const listo = producto !== null && !r.ocupado && cant(cantidad) > 0;

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
    setCosto(miles(Math.round(p.costo)));
    setTimeout(() => cantRef.current?.select(), 0);
  }

  async function confirmar() {
    if (!listo || !producto) return;
    if (await r.agregar({ productoId: producto.id, cantidad: cant(cantidad), costoUnitario: num(costo || "0") })) alAgregar();
  }
  const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void confirmar();
    }
    if (e.key === "Escape") cerrar();
  };

  return (
    <tr className="repuestos-nueva">
      <td>
        {producto ? (
          <button type="button" className="repuestos-producto" onClick={() => setProducto(null)} title="Cambiar producto">
            {producto.nombre}
          </button>
        ) : (
          <div className="repuestos-buscar">
            <input
              className="celda"
              autoFocus
              placeholder="Buscar repuesto por nombre o código"
              autoComplete="off"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && cerrar()}
              aria-label="Repuesto"
            />
            {resultados?.q === busqueda && (
              <div className="repuestos-opciones" role="listbox" aria-label="Repuestos encontrados">
                {resultados.lista.length === 0 && <span className="small muted">No hay repuestos con ese nombre.</span>}
                {resultados.lista.map((p) => (
                  <button key={p.id} type="button" role="option" aria-selected={false} onClick={() => elegir(p)}>
                    <span>{p.nombre}</span>
                    <span className="small muted">{gs(p.costo)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </td>
      <td className="num">
        <input ref={cantRef} className="celda num" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} onKeyDown={alTeclear} aria-label="Cantidad" />
      </td>
      <td>{producto?.unidad ?? ""}</td>
      <td className="num">
        <input className="celda num" inputMode="numeric" value={costo} onChange={(e) => setCosto(e.target.value)} onKeyDown={alTeclear} aria-label="Costo unitario" />
      </td>
      <td className="num">{producto ? miles(cant(cantidad) * num(costo || "0") || 0) : ""}</td>
      <td className="num" style={{ whiteSpace: "nowrap" }}>
        <button type="button" className="btn btn-primary repuestos-guardar" disabled={!listo} onClick={confirmar}>
          Guardar
        </button>
        <button type="button" className="repuestos-quitar" onClick={cerrar} aria-label="Descartar línea" title="Descartar">
          ✕
        </button>
      </td>
    </tr>
  );
}
