"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductoExistente } from "@/lib/crear-producto";

type Opcion = { id: number; nombre: string };

// Montos en guaraníes: el punto es separador de miles.
const monto = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const mostrar = (s: string) => {
  const n = monto(s);
  return s.trim() === "" || Number.isNaN(n) ? s : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);
};

export function FormProducto({ categorias, proveedores }: { categorias: Opcion[]; proveedores: Opcion[] }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [codigo, setCodigo] = useState("");
  const [costo, setCosto] = useState("");
  const [precio, setPrecio] = useState("");
  const [precioTocado, setPrecioTocado] = useState(false);
  const [proveedorId, setProveedorId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicados, setDuplicados] = useState<ProductoExistente[] | null>(null);

  const precioFinal = precioTocado ? precio : costo;
  const valido = nombre.trim().length >= 3 && categoriaId && costo.trim() !== "" && !Number.isNaN(monto(costo)) && !Number.isNaN(monto(precioFinal || "0"));

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!valido || enviando) return;
    setEnviando(true);
    setError(null);
    setDuplicados(null);
    try {
      const r = await fetch("/api/productos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          categoriaId: Number(categoriaId),
          codigo: codigo.trim() || null,
          costo: monto(costo),
          precio: monto(precioFinal || "0"),
          proveedorId: proveedorId ? Number(proveedorId) : null,
        }),
      });
      if (r.status === 401) return router.replace("/ingresar");
      const d = await r.json().catch(() => ({}));
      if (r.status === 409 && d.existentes) return setDuplicados(d.existentes);
      if (!r.ok) return setError(d.error ?? "No se pudo crear el producto");
      const avisos = (d.avisos as string[] | undefined)?.length ? "&avisos=1" : "";
      router.replace(`/inventario/${d.productoId}?creado=1${avisos}`);
    } catch {
      setError("Se cortó la conexión. Revisá en Productos si se creó antes de intentar de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="wrap">
      <form className="stack form-angosto" style={{ gap: 14 }} onSubmit={crear}>
        <div className="field">
          <label htmlFor="p-nombre">Nombre</label>
          <input id="p-nombre" className="input" value={nombre} onChange={(e) => { setNombre(e.target.value); setDuplicados(null); }} placeholder="Ej: Pastilla de freno - GTR" maxLength={120} required />
        </div>
        <div className="field">
          <label htmlFor="p-cat">Categoría</label>
          <select id="p-cat" className="input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} required>
            <option value="">Elegí la categoría</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="p-cod">Código <span className="muted small">(opcional)</span></label>
          <input id="p-cod" className="input" value={codigo} onChange={(e) => { setCodigo(e.target.value); setDuplicados(null); }} maxLength={40} autoCapitalize="characters" />
        </div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="p-costo">Costo (Gs.)</label>
            <input id="p-costo" className="input" inputMode="numeric" value={mostrar(costo)} onChange={(e) => setCosto(e.target.value)} required />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="p-precio">Precio de venta (Gs.)</label>
            <input id="p-precio" className="input" inputMode="numeric" value={mostrar(precioFinal)} onChange={(e) => { setPrecioTocado(true); setPrecio(e.target.value); }} />
            {!precioTocado && <span className="tiny muted">Igual al costo, salvo que lo cambies.</span>}
          </div>
        </div>
        <div className="field">
          <label htmlFor="p-prov">Proveedor <span className="muted small">(opcional)</span></label>
          <select id="p-prov" className="input" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
            <option value="">Sin proveedor</option>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <span className="tiny muted">Queda cargado como proveedor del producto, con el costo como precio.</span>
        </div>

        <div className="alert alert-warn small">
          Se crea en Odoo como producto con stock, con los mismos impuestos y ruta de compra que el último producto cargado. El stock entra cuando se recibe una compra.
        </div>

        {duplicados && (
          <div className="alert alert-warn stack" style={{ gap: 8 }} role="alert">
            <strong>Ya existe un producto con ese nombre o código.</strong>
            {duplicados.map((p) => (
              <Link key={p.id} className="btn" href={`/inventario/${p.id}`}>Abrir {p.nombre}{p.codigo ? ` (${p.codigo})` : ""}</Link>
            ))}
          </div>
        )}
        {error && <div className="alert alert-danger" role="alert">{error}</div>}

        <button className="btn btn-primary btn-lg" disabled={!valido || enviando}>{enviando ? "Creando en Odoo…" : "Crear producto"}</button>
      </form>
    </main>
  );
}
