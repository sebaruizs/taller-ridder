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
