"use client";
import type { ProductoExistente } from "@/lib/crear-producto";

// Campos del alta de producto, compartidos por «Nuevo producto» (Inventario) y «Nueva compra».

type Opcion = { id: number; nombre: string };

export type ValoresProducto = { nombre: string; categoriaId: string; codigo: string; costo: string; precio: string; precioTocado: boolean };

export const productoVacio = (nombre = ""): ValoresProducto => ({ nombre, categoriaId: "", codigo: "", costo: "", precio: "", precioTocado: false });

// Montos en guaraníes: el punto es separador de miles.
const monto = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const mostrar = (s: string) => {
  const n = monto(s);
  return s.trim() === "" || Number.isNaN(n) ? s : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);
};

// Lo que se manda a la API, o null si falta algo. El precio de venta es el costo salvo que lo cambien.
export function datosProducto(v: ValoresProducto) {
  const precio = v.precioTocado ? v.precio : v.costo;
  const ok = v.nombre.trim().length >= 3 && v.categoriaId && v.costo.trim() !== "" && !Number.isNaN(monto(v.costo)) && !Number.isNaN(monto(precio || "0"));
  if (!ok) return null;
  return { nombre: v.nombre.trim(), categoriaId: Number(v.categoriaId), codigo: v.codigo.trim() || null, costo: monto(v.costo), precio: monto(precio || "0") };
}

export function CamposProducto({
  v,
  cambiar,
  categorias,
  id = "p",
  autoFocus,
}: {
  v: ValoresProducto;
  cambiar: (c: Partial<ValoresProducto>) => void;
  categorias: Opcion[];
  id?: string;
  autoFocus?: boolean;
}) {
  const precioFinal = v.precioTocado ? v.precio : v.costo;
  return (
    <>
      <div className="field">
        <label htmlFor={`${id}-nombre`}>Nombre</label>
        <input id={`${id}-nombre`} className="input" value={v.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} placeholder="Ej: Pastilla de freno - GTR" maxLength={120} autoFocus={autoFocus} required />
      </div>
      <div className="field">
        <label htmlFor={`${id}-cat`}>Categoría</label>
        <select id={`${id}-cat`} className="input" value={v.categoriaId} onChange={(e) => cambiar({ categoriaId: e.target.value })} required>
          <option value="">Elegí la categoría</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${id}-cod`}>Código <span className="muted small">(opcional)</span></label>
        <input id={`${id}-cod`} className="input" value={v.codigo} onChange={(e) => cambiar({ codigo: e.target.value })} maxLength={40} autoCapitalize="characters" />
      </div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`${id}-costo`}>Costo (Gs.)</label>
          <input id={`${id}-costo`} className="input" inputMode="numeric" value={mostrar(v.costo)} onChange={(e) => cambiar({ costo: e.target.value })} required />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`${id}-precio`}>Precio de venta (Gs.)</label>
          <input id={`${id}-precio`} className="input" inputMode="numeric" value={mostrar(precioFinal)} onChange={(e) => cambiar({ precioTocado: true, precio: e.target.value })} />
          {!v.precioTocado && <span className="tiny muted">Igual al costo, salvo que lo cambies.</span>}
        </div>
      </div>
    </>
  );
}

export function AvisoDuplicados({ existentes, accion }: { existentes: ProductoExistente[]; accion: (p: ProductoExistente) => React.ReactNode }) {
  return (
    <div className="alert alert-warn stack" style={{ gap: 8 }} role="alert">
      <strong>Ya existe un producto con ese nombre o código.</strong>
      {existentes.map(accion)}
    </div>
  );
}
