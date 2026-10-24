// Filtros y reglas de Inventario (sin I/O). Odoo es la fuente: todo se filtra en el dominio.
import type { Domain } from "./odoo";

export type FiltroStock = "todos" | "con" | "sin";
export const POR_PAGINA_INVENTARIO = 50;

export function dominioProductos(f: { q?: string; categoriaId?: number; stock?: FiltroStock }): Domain {
  const d: Domain = [["is_storable", "=", true], ["active", "=", true]];
  const q = f.q?.trim();
  if (q) d.push("|", ["name", "ilike", q], ["default_code", "ilike", q]);
  if (f.categoriaId) d.push(["categ_id", "child_of", f.categoriaId]);
  if (f.stock === "con") d.push(["qty_available", ">", 0]);
  if (f.stock === "sin") d.push(["qty_available", "<=", 0]);
  return d;
}

export type TipoMovimiento = "entrada" | "salida" | "interno";

// Entrada si llega a un depósito propio; salida si sale de uno.
export function tipoMovimiento(origenInterno: boolean, destinoInterno: boolean): TipoMovimiento {
  if (destinoInterno && !origenInterno) return "entrada";
  if (origenInterno && !destinoInterno) return "salida";
  return "interno";
}

export function valorStock(cantidad: number, costo: number): number {
  return cantidad > 0 ? cantidad * costo : 0;
}

// Costo de la app: el precio unitario de la última compra confirmada. Es una variable propia,
// no se escribe en Odoo; el costo de Odoo (standard_price) se muestra aparte.
export type UltimaCompra = { precio: number; fecha: string | null; proveedor: string | null };
export type LineaCompraCosto = { product_id: [number, string] | false; price_unit: number; date_order: string | false; partner_id: [number, string] | false };

// Las líneas tienen que venir de la más nueva a la más vieja: gana la primera de cada producto.
export function ultimasCompras(lineas: LineaCompraCosto[]): Map<number, UltimaCompra> {
  const m = new Map<number, UltimaCompra>();
  for (const l of lineas) {
    if (!l.product_id || m.has(l.product_id[0])) continue;
    m.set(l.product_id[0], { precio: l.price_unit, fecha: l.date_order ? l.date_order.slice(0, 10) : null, proveedor: l.partner_id ? l.partner_id[1] : null });
  }
  return m;
}

// Sin compras registradas se usa el costo de Odoo, avisando de dónde sale.
export function costoApp(ultima: UltimaCompra | undefined, costoOdoo: number) {
  return ultima
    ? { costo: ultima.precio, origen: "compra" as const, fecha: ultima.fecha, proveedor: ultima.proveedor }
    : { costo: costoOdoo, origen: "odoo" as const, fecha: null, proveedor: null };
}
