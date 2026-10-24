// Reglas de Compras (sin I/O). Odoo es la fuente: filtros en el dominio, compras en purchase.order.
import type { Domain } from "./odoo";
import { NOTA_INTERNA, escaparHtml } from "./taller";

export const POR_PAGINA_COMPRAS = 40;

export type FiltroRecepcion = "todas" | "pendientes" | "recibidas";

export const RECEPCION: Record<string, string> = {
  full: "Recibida",
  partial: "Recibida en parte",
  pending: "Sin recibir",
};

export function dominioCompras(f: { q?: string; proveedorId?: number; recepcion?: FiltroRecepcion }): Domain {
  const d: Domain = [["state", "in", ["purchase", "done"]]];
  const q = f.q?.trim();
  if (q) d.push("|", "|", ["name", "ilike", q], ["partner_id.name", "ilike", q], ["partner_ref", "ilike", q]);
  if (f.proveedorId) d.push(["partner_id", "=", f.proveedorId]);
  if (f.recepcion === "pendientes") d.push(["receipt_status", "in", ["pending", "partial"]]);
  if (f.recepcion === "recibidas") d.push(["receipt_status", "=", "full"]);
  return d;
}

export type LineaNueva = { productoId: number; nombre: string; cantidad: number; precio: number };

export type DatosCompra = {
  clave: string;
  proveedorId: number;
  referencia: string | null;
  lineas: LineaNueva[];
  recibir: boolean;
};

// Marca en "origin" para encontrar la compra si el envío se repite (doble toque o reintento).
export function origenApp(clave: string): string {
  return `APP-${clave}`;
}

// Sin impuestos, como todas las compras cargadas hasta hoy en Odoo.
export function payloadCompra(d: DatosCompra, ahora: string) {
  const vals: Record<string, unknown> = {
    partner_id: d.proveedorId,
    origin: origenApp(d.clave),
    date_order: ahora,
    order_line: d.lineas.map((l) => [
      0,
      0,
      { product_id: l.productoId, name: l.nombre, product_qty: l.cantidad, price_unit: l.precio, taxes_id: [[6, 0, []]], date_planned: ahora },
    ]),
  };
  if (d.referencia?.trim()) vals.partner_ref = d.referencia.trim();
  return vals;
}

export function totalCompra(lineas: Pick<LineaNueva, "cantidad" | "precio">[]): number {
  return lineas.reduce((s, l) => s + l.cantidad * l.precio, 0);
}

const gs = (n: number) => `Gs. ${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Math.round(n))}`;
const cant = (n: number) => new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(n);

export function payloadNotaCompra(p: { autor: string; lineas: LineaNueva[]; recibir: boolean }) {
  return {
    body:
      `<p><b>Compra cargada por ${escaparHtml(p.autor)}</b> (app del taller).</p>` +
      `<ul>${p.lineas.map((l) => `<li>${cant(l.cantidad)} × ${escaparHtml(l.nombre)} — ${gs(l.cantidad * l.precio)}</li>`).join("")}</ul>` +
      `<p>Total: <b>${gs(totalCompra(p.lineas))}</b>${p.recibir ? " · Mercadería recibida al cargar" : " · Pendiente de recibir"}</p>`,
    ...NOTA_INTERNA,
  };
}

export function payloadNotaRecepcion(autor: string) {
  return { body: `<p><b>${escaparHtml(autor)} recibió la mercadería</b> (app del taller). Entró al stock.</p>`, ...NOTA_INTERNA };
}
