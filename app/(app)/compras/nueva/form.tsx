"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductoCompra } from "@/lib/compras";
import type { ProductoExistente } from "@/lib/crear-producto";
import { BuscadorProducto, cant, miles, num as monto } from "@/components/lineas";
import { AvisoDuplicados, CamposProducto, datosProducto, productoVacio, type ValoresProducto } from "@/components/campos-producto";

type Opcion = { id: number; nombre: string };
type Linea = { productoId: number; nombre: string; cantidad: string; precio: string; origen: string; unidad: string | null };

const gs = (n: number) => `Gs. ${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Math.round(n))}`;
const urlProductos = (q: string) => `/api/compras/productos?q=${encodeURIComponent(q)}`;
const conMiles = (s: string) => {
  const n = monto(s);
  return s.trim() === "" || Number.isNaN(n) ? s : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);
};

// categorias: null si el usuario no puede crear productos (no ve «Crear producto nuevo»).
export function FormCompra({ proveedores, categorias, autor }: { proveedores: Opcion[]; categorias: Opcion[] | null; autor: string }) {
  const router = useRouter();
  const [clave] = useState(() => crypto.randomUUID());
  const [proveedorId, setProveedorId] = useState("");
  const [referencia, setReferencia] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [recibir, setRecibir] = useState(true);
  const [agregando, setAgregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<ValoresProducto | null>(null);

  // Elegir el producto en «Agregar una línea» crea la fila con cantidad 1 y el último precio pagado.
  function agregar(p: ProductoCompra) {
    setLineas((ls) =>
      ls.some((l) => l.productoId === p.id)
        ? ls
        : [...ls, { productoId: p.id, nombre: p.nombre, cantidad: "1", precio: String(Math.round(p.precio)), origen: p.precioOrigen, unidad: p.unidad }],
    );
    setAgregando(false);
    setNuevo(null);
  }

  const cambiar = (i: number, campo: "cantidad" | "precio", v: string) =>
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: v } : l)));
  const quitar = (i: number) => setLineas((ls) => ls.filter((_, j) => j !== i));

  const total = lineas.reduce((s, l) => s + (cant(l.cantidad) || 0) * (monto(l.precio) || 0), 0);
  const lineasValidas = lineas.length > 0 && lineas.every((l) => cant(l.cantidad) > 0 && monto(l.precio) >= 0 && !Number.isNaN(monto(l.precio)));
  const puedeGuardar = proveedorId && lineasValidas && !enviando && !nuevo;

  function abrirNuevo(q: string) {
    setAgregando(false);
    setNuevo(productoVacio(q));
  }

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
    <main className="wrap wrap-ancho">
      <form className="stack" style={{ gap: 14 }} onSubmit={guardar}>
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

        {/* Líneas de la compra, como en Odoo: una fila por producto, editable en el lugar. */}
        <section className="card stack lineas-caja" style={{ gap: 0 }}>
          <strong className="lineas-titulo">Productos</strong>
          <div className="tabla-scroll">
            <table className="tabla lineas-tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="num">Cantidad</th>
                  <th>UdM</th>
                  <th className="num">Precio unitario</th>
                  <th className="num">Subtotal</th>
                  <th aria-label="Quitar" />
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={l.productoId}>
                    <td>
                      {l.nombre}
                      <div className="tiny muted">Precio sugerido: {l.origen}</div>
                    </td>
                    <td className="num">
                      <input className="celda num" inputMode="decimal" aria-label={`Cantidad de ${l.nombre}`} value={l.cantidad} onChange={(e) => cambiar(i, "cantidad", e.target.value)} />
                    </td>
                    <td>{l.unidad ?? ""}</td>
                    <td className="num">
                      <input className="celda num" inputMode="numeric" aria-label={`Precio unitario de ${l.nombre}`} value={conMiles(l.precio)} onChange={(e) => cambiar(i, "precio", e.target.value)} />
                    </td>
                    <td className="num">{miles((cant(l.cantidad) || 0) * (monto(l.precio) || 0))}</td>
                    <td className="num">
                      <button type="button" className="lineas-quitar" onClick={() => quitar(i)} aria-label={`Quitar ${l.nombre}`} title="Quitar">
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
                {lineas.length === 0 && !agregando && (
                  <tr>
                    <td colSpan={6} className="small muted">Todavía no agregaste productos.</td>
                  </tr>
                )}
                <tr className={agregando ? "lineas-nueva" : undefined}>
                  <td colSpan={agregando ? 5 : 6}>
                    {agregando ? (
                      <BuscadorProducto<ProductoCompra>
                        url={urlProductos}
                        detalle={(p) => `${gs(p.precio)} · stock ${p.stock}`}
                        alElegir={agregar}
                        alCerrar={() => setAgregando(false)}
                        vacio={categorias ? "No hay productos con ese nombre." : "No hay productos con ese nombre. Si es nuevo, pedí que lo creen en Inventario."}
                        extra={
                          categorias
                            ? (q) => (
                                <button type="button" className="lineas-crear" onClick={() => abrirNuevo(q)}>
                                  <span>+ Crear producto nuevo «{q}»</span>
                                </button>
                              )
                            : undefined
                        }
                      />
                    ) : (
                      <button type="button" className="lineas-agregar" onClick={() => setAgregando(true)} disabled={!!nuevo}>
                        Agregar una línea
                      </button>
                    )}
                  </td>
                  {agregando && (
                    <td className="num">
                      <button type="button" className="lineas-quitar" onClick={() => setAgregando(false)} aria-label="Descartar línea" title="Descartar">
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
          {nuevo && categorias && (
            <ProductoNuevo
              inicial={nuevo}
              categorias={categorias}
              proveedor={proveedores.find((p) => String(p.id) === proveedorId) ?? null}
              alCrear={agregar}
              alCerrar={() => setNuevo(null)}
            />
          )}
          <div className="lineas-total">
            <span className="small muted">{lineas.length === 1 ? "1 producto" : `${lineas.length} productos`} · sin impuestos, como las compras actuales · </span>
            <span className="muted">Total:</span> <strong>{gs(total)}</strong>
          </div>
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

// Alta de producto dentro de la compra: se crea en Odoo y entra como línea, sin salir de la pantalla.
function ProductoNuevo({
  inicial,
  categorias,
  proveedor,
  alCrear,
  alCerrar,
}: {
  inicial: ValoresProducto;
  categorias: Opcion[];
  proveedor: Opcion | null;
  alCrear: (p: ProductoCompra) => void;
  alCerrar: () => void;
}) {
  const router = useRouter();
  const [v, setV] = useState(inicial);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicados, setDuplicados] = useState<{ existentes: ProductoExistente[]; productos: ProductoCompra[] } | null>(null);
  const datos = datosProducto(v);

  const cambiar = (c: Partial<ValoresProducto>) => {
    setV((x) => ({ ...x, ...c }));
    if ("nombre" in c || "codigo" in c) setDuplicados(null);
  };

  async function crear() {
    if (!datos || enviando) return;
    setEnviando(true);
    setError(null);
    setDuplicados(null);
    try {
      const r = await fetch("/api/compras/productos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...datos, proveedorId: proveedor?.id ?? null }),
      });
      if (r.status === 401) return router.replace("/ingresar");
      const d = await r.json().catch(() => ({}));
      if (r.status === 409 && d.existentes) return setDuplicados({ existentes: d.existentes, productos: d.productos ?? [] });
      if (!r.ok) return setError(d.error ?? "No se pudo crear el producto");
      alCrear(d.producto);
    } catch {
      setError("Se cortó la conexión. Buscá el producto en «Agregar una línea» antes de crearlo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    // No es un <form>: está dentro del formulario de la compra. Enter crea el producto, no guarda la compra.
    <div
      className="card stack lineas-producto-nuevo"
      style={{ gap: 12 }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          crear();
        }
        if (e.key === "Escape") alCerrar();
      }}
    >
      <strong>Producto nuevo</strong>
      <CamposProducto v={v} cambiar={cambiar} categorias={categorias} id="np" autoFocus />
      <span className="tiny muted">
        Se crea en Odoo como producto con stock{proveedor ? `, con ${proveedor.nombre} como proveedor` : ""}. El costo es el precio de la línea; lo podés cambiar después.
      </span>
      {duplicados && (
        <AvisoDuplicados
          existentes={duplicados.existentes}
          accion={(p) => {
            const comprable = duplicados.productos.find((x) => x.id === p.id);
            return comprable ? (
              <button key={p.id} type="button" className="btn" onClick={() => alCrear(comprable)}>
                Agregar {p.nombre}{p.codigo ? ` (${p.codigo})` : ""} a la compra
              </button>
            ) : (
              <span key={p.id} className="small">
                {p.nombre}{p.codigo ? ` (${p.codigo})` : ""} <span className="muted">· archivado o no se puede comprar</span>
              </span>
            );
          }}
        />
      )}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <div className="row wrap-row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-primary" onClick={crear} disabled={!datos || enviando}>
          {enviando ? "Creando en Odoo…" : "Crear y agregar a la compra"}
        </button>
        <button type="button" className="btn" onClick={alCerrar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
