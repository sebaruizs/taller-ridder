"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductoCompra } from "@/lib/compras";

type Opcion = { id: number; nombre: string };
type Linea = { productoId: number; nombre: string; cantidad: string; precio: string; origen: string };

const gs = (n: number) => `Gs. ${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Math.round(n))}`;
// Precio en guaraníes: el punto es separador de miles. Cantidad: acepta 1,5 o 1.5.
const monto = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const cant = (s: string) => Number(s.replace(",", "."));
const conMiles = (s: string) => {
  const n = monto(s);
  return s.trim() === "" || Number.isNaN(n) ? s : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);
};

export function FormCompra({ proveedores, autor }: { proveedores: Opcion[]; autor: string }) {
  const router = useRouter();
  const [clave] = useState(() => crypto.randomUUID());
  const [proveedorId, setProveedorId] = useState("");
  const [referencia, setReferencia] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [recibir, setRecibir] = useState(true);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<{ q: string; lista: ProductoCompra[] } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busqueda = q.trim();
  useEffect(() => {
    if (busqueda.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/compras/productos?q=${encodeURIComponent(busqueda)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => setResultados({ q: busqueda, lista: d.productos ?? [] }))
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [busqueda]);

  function agregar(p: ProductoCompra) {
    setLineas((ls) =>
      ls.some((l) => l.productoId === p.id)
        ? ls
        : [...ls, { productoId: p.id, nombre: p.nombre, cantidad: "1", precio: String(Math.round(p.precio)), origen: p.precioOrigen }],
    );
    setQ("");
    setResultados(null);
  }

  const cambiar = (i: number, campo: "cantidad" | "precio", v: string) =>
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: v } : l)));
  const quitar = (i: number) => setLineas((ls) => ls.filter((_, j) => j !== i));

  const total = lineas.reduce((s, l) => s + (cant(l.cantidad) || 0) * (monto(l.precio) || 0), 0);
  const lineasValidas = lineas.length > 0 && lineas.every((l) => cant(l.cantidad) > 0 && monto(l.precio) >= 0 && !Number.isNaN(monto(l.precio)));
  const puedeGuardar = proveedorId && lineasValidas && !enviando;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!puedeGuardar) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clave,
          proveedorId: Number(proveedorId),
          referencia: referencia.trim() || null,
          recibir,
          lineas: lineas.map((l) => ({ productoId: l.productoId, nombre: l.nombre, cantidad: cant(l.cantidad), precio: monto(l.precio) })),
        }),
      });
      if (r.status === 401) return router.replace("/ingresar");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.error ?? "No se pudo cargar la compra");
      const params = new URLSearchParams({ creada: "1" });
      if (d.recibida) params.set("recibida", "1");
      if (d.avisos?.length) params.set("avisos", "1");
      router.replace(`/compras/${d.compraId}?${params}`);
    } catch {
      setError("Se cortó la conexión. Tocá Guardar de nuevo: no se va a duplicar la compra.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="wrap">
      <form className="stack" style={{ gap: 14, maxWidth: 900 }} onSubmit={guardar}>
        <div className="row wrap-row" style={{ gap: 12, alignItems: "flex-start" }}>
          <div className="field" style={{ flex: "1 1 260px" }}>
            <label htmlFor="c-prov">Proveedor</label>
            <select id="c-prov" className="input" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} required>
              <option value="">Elegí el proveedor</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: "1 1 200px" }}>
            <label htmlFor="c-ref">Factura o remito <span className="muted small">(opcional)</span></label>
            <input id="c-ref" className="input" value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={60} placeholder="Ej: 001-001-0001234" />
          </div>
        </div>

        <section className="card stack" style={{ gap: 10 }}>
          <strong>Productos</strong>
          <div className="field">
            <input className="input" placeholder="Buscar producto por nombre o código para agregarlo" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar producto" />
            {resultados?.q === busqueda && resultados.lista.length === 0 && <span className="small muted">No hay productos con ese nombre. Si es nuevo, crealo primero en Inventario.</span>}
            {resultados?.q === busqueda && resultados.lista.length > 0 && (
              <div className="stack" style={{ gap: 6 }} role="listbox" aria-label="Productos encontrados">
                {resultados.lista.map((p) => (
                  <button key={p.id} type="button" role="option" aria-selected={false} className="card row between" style={{ textAlign: "left", cursor: "pointer", padding: "10px 12px" }} onClick={() => agregar(p)}>
                    <span>{p.nombre} <span className="tiny muted">· stock {p.stock}</span></span>
                    <span className="small muted" style={{ whiteSpace: "nowrap" }}>{gs(p.precio)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {lineas.length === 0 && <span className="small muted">Todavía no agregaste productos.</span>}
          {lineas.map((l, i) => (
            <div key={l.productoId} className="linea-compra">
              <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                <strong className="small">{l.nombre}</strong>
                <span className="tiny muted">Precio sugerido: {l.origen}</span>
              </div>
              <input className="input" inputMode="decimal" aria-label={`Cantidad de ${l.nombre}`} value={l.cantidad} onChange={(e) => cambiar(i, "cantidad", e.target.value)} />
              <input className="input" inputMode="numeric" aria-label={`Precio unitario de ${l.nombre}`} value={conMiles(l.precio)} onChange={(e) => cambiar(i, "precio", e.target.value)} />
              <span className="small num-linea">{gs((cant(l.cantidad) || 0) * (monto(l.precio) || 0))}</span>
              <button type="button" className="btn btn-ghost small" onClick={() => quitar(i)} aria-label={`Quitar ${l.nombre}`}>Quitar</button>
            </div>
          ))}
          {lineas.length > 0 && (
            <div className="row between" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
              <span className="small muted">{lineas.length === 1 ? "1 producto" : `${lineas.length} productos`} · sin impuestos, como las compras actuales</span>
              <strong>Total {gs(total)}</strong>
            </div>
          )}
        </section>

        <label className="check">
          <input type="checkbox" checked={recibir} onChange={(e) => setRecibir(e.target.checked)} />
          <span>
            <strong>Ya recibí la mercadería</strong>
            <br />
            <span className="small muted">{recibir ? "Se valida la recepción en Odoo y entra al stock ahora." : "La compra queda confirmada y la recibís después desde el detalle."}</span>
          </span>
        </label>

        {error && <div className="alert alert-danger" role="alert">{error}</div>}

        <div className="bottom-bar">
          <div className="stack" style={{ gap: 6 }}>
            <button className="btn btn-primary btn-block btn-lg" disabled={!puedeGuardar}>
              {enviando ? "Cargando en Odoo…" : `Guardar compra${lineas.length ? ` · ${gs(total)}` : ""}`}
            </button>
            <span className="tiny muted center">Queda registrada como cargada por {autor}</span>
          </div>
        </div>
      </form>
    </main>
  );
}
