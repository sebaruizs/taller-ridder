"use client";
import { useEffect, useState } from "react";

// Piezas de las tablas tipo Odoo (repuestos de una orden, líneas de una compra).

export const miles = (n: number) => new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(n);
// Montos en guaraníes: el punto es separador de miles. Cantidad: acepta 1,5 o 1.5.
export const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
export const cant = (s: string) => Number(s.replace(",", "."));

// Buscador de producto dentro de la fila nueva («Agregar una línea»), con la lista desplegada debajo.
export function BuscadorProducto<T extends { id: number; nombre: string }>({
  url,
  detalle,
  alElegir,
  alCerrar,
  vacio = "No hay productos con ese nombre.",
  extra,
}: {
  url: (q: string) => string;
  detalle: (p: T) => React.ReactNode;
  alElegir: (p: T) => void;
  alCerrar: () => void;
  vacio?: string;
  // Opción al final de la lista (por ejemplo «Crear producto nuevo»), con lo que se buscó.
  extra?: (q: string) => React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<{ q: string; lista: T[] } | null>(null);
  const busqueda = q.trim();

  useEffect(() => {
    if (busqueda.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(url(busqueda), { signal: ctrl.signal })
        .then((res) => res.json())
        .then((d) => setResultados({ q: busqueda, lista: d.productos ?? [] }))
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [busqueda, url]);

  return (
    <div className="lineas-buscar">
      <input
        className="celda"
        autoFocus
        placeholder="Buscar producto por nombre o código"
        autoComplete="off"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && alCerrar()}
        aria-label="Producto"
      />
      {resultados?.q === busqueda && (
        <div className="lineas-opciones" role="listbox" aria-label="Productos encontrados">
          {resultados.lista.length === 0 && <span className="small muted">{vacio}</span>}
          {resultados.lista.map((p) => (
            <button key={p.id} type="button" role="option" aria-selected={false} onClick={() => alElegir(p)}>
              <span>{p.nombre}</span>
              <span className="small muted">{detalle(p)}</span>
            </button>
          ))}
          {extra?.(busqueda)}
        </div>
      )}
    </div>
  );
}
