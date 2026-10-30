"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductoExistente } from "@/lib/crear-producto";
import { AvisoDuplicados, CamposProducto, datosProducto, productoVacio, type ValoresProducto } from "@/components/campos-producto";

type Opcion = { id: number; nombre: string };

export function FormProducto({ categorias, proveedores }: { categorias: Opcion[]; proveedores: Opcion[] }) {
  const router = useRouter();
  const [v, setV] = useState<ValoresProducto>(() => productoVacio());
  const [proveedorId, setProveedorId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicados, setDuplicados] = useState<ProductoExistente[] | null>(null);

  const datos = datosProducto(v);
  const cambiar = (c: Partial<ValoresProducto>) => {
    setV((x) => ({ ...x, ...c }));
    if ("nombre" in c || "codigo" in c) setDuplicados(null);
  };

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!datos || enviando) return;
    setEnviando(true);
    setError(null);
    setDuplicados(null);
    try {
      const r = await fetch("/api/productos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...datos, proveedorId: proveedorId ? Number(proveedorId) : null }),
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
        <CamposProducto v={v} cambiar={cambiar} categorias={categorias} />
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
          <AvisoDuplicados
            existentes={duplicados}
            accion={(p) => <Link key={p.id} className="btn" href={`/inventario/${p.id}`}>Abrir {p.nombre}{p.codigo ? ` (${p.codigo})` : ""}</Link>}
          />
        )}
        {error && <div className="alert alert-danger" role="alert">{error}</div>}

        <button className="btn btn-primary btn-lg" disabled={!datos || enviando}>{enviando ? "Creando en Odoo…" : "Crear producto"}</button>
      </form>
    </main>
  );
}
