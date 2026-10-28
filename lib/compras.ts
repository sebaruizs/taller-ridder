import "server-only";
import { odoo, type Many2one } from "./odoo";
import { POR_PAGINA_COMPRAS, dominioCompras, type FiltroRecepcion } from "./compras-dominio";
import { hoyAsuncion } from "./taller";

type CompraOdoo = {
  id: number;
  name: string;
  partner_id: Many2one;
  partner_ref: string | false;
  date_order: string | false;
  amount_total: number;
  receipt_status: string | false;
  create_uid: Many2one;
  origin: string | false;
};

export type CompraLista = {
  id: number;
  numero: string;
  proveedor: string | null;
  referencia: string | null;
  fecha: string | null;
  total: number;
  recepcion: string;
  cargadaPor: string | null;
  desdeApp: boolean;
};

const CAMPOS = ["id", "name", "partner_id", "partner_ref", "date_order", "amount_total", "receipt_status", "create_uid", "origin"];

function aLista(c: CompraOdoo): CompraLista {
  return {
    id: c.id,
    numero: c.name,
    proveedor: c.partner_id ? c.partner_id[1] : null,
    referencia: c.partner_ref || null,
    fecha: c.date_order ? c.date_order.slice(0, 10) : null,
    total: c.amount_total,
    recepcion: c.receipt_status || "pending",
    cargadaPor: c.create_uid ? c.create_uid[1] : null,
    desdeApp: Boolean(c.origin && c.origin.startsWith("APP-")),
  };
}

export async function listarCompras(f: { q?: string; proveedorId?: number; recepcion?: FiltroRecepcion; pagina: number }) {
  const domain = dominioCompras(f);
  const [total, filas] = await Promise.all([
    odoo.searchCount("purchase.order", domain),
    odoo.searchRead<CompraOdoo>("purchase.order", domain, CAMPOS, {
      limit: POR_PAGINA_COMPRAS,
      offset: (f.pagina - 1) * POR_PAGINA_COMPRAS,
      order: "date_order desc, id desc",
    }),
  ]);
  return { total, pagina: f.pagina, porPagina: POR_PAGINA_COMPRAS, compras: filas.map(aLista) };
}

export async function resumenCompras() {
  const hoy = hoyAsuncion();
  const inicioMes = `${hoy.slice(0, 7)}-01 00:00:00`;
  const confirmadas = dominioCompras({});
  const [[mes], pendientes, [todo]] = await Promise.all([
    odoo.readGroup<{ amount_total: number; __count: number }>("purchase.order", [...confirmadas, ["date_order", ">=", inicioMes]], ["amount_total:sum"], []),
    odoo.searchCount("purchase.order", dominioCompras({ recepcion: "pendientes" })),
    odoo.readGroup<{ amount_total: number; __count: number }>("purchase.order", confirmadas, ["amount_total:sum"], []),
  ]);
  return {
    totalMes: mes?.amount_total ?? 0,
    comprasMes: mes?.__count ?? 0,
    pendientes,
    totalHistorico: todo?.amount_total ?? 0,
  };
}

export type LineaCompra = { id: number; productoId: number | null; producto: string; cantidad: number; recibido: number; unidad: string | null; precio: number; subtotal: number };
export type RecepcionCompra = { id: number; numero: string; estado: string; fecha: string | null };

const ESTADO_PICKING: Record<string, string> = { done: "Recibida", assigned: "Lista para recibir", confirmed: "En espera", waiting: "En espera", draft: "Borrador", cancel: "Cancelada" };

export async function detalleCompra(id: number) {
  const [c] = await odoo
    .searchRead<CompraOdoo & { state: string; order_line: number[]; picking_ids: number[]; amount_untaxed: number; amount_tax: number; date_approve: string | false; user_id: Many2one }>(
      "purchase.order",
      [["id", "=", id]],
      [...CAMPOS, "state", "order_line", "picking_ids", "amount_untaxed", "amount_tax", "date_approve", "user_id"],
      { limit: 1 },
    )
    .catch(() => []);
  if (!c) return null;
  const [lineas, recepciones] = await Promise.all([
    c.order_line.length
      ? odoo.searchRead<{ id: number; product_id: Many2one; name: string; product_qty: number; qty_received: number; product_uom: Many2one; price_unit: number; price_subtotal: number }>(
          "purchase.order.line",
          [["id", "in", c.order_line]],
          ["id", "product_id", "name", "product_qty", "qty_received", "product_uom", "price_unit", "price_subtotal"],
          // UdM en español, como en Odoo.
          { limit: c.order_line.length, order: "sequence asc, id asc", context: { lang: "es_419" } },
        )
      : Promise.resolve([]),
    c.picking_ids.length
      ? odoo.read<{ id: number; name: string; state: string; date_done: string | false }>("stock.picking", c.picking_ids, ["id", "name", "state", "date_done"])
      : Promise.resolve([]),
  ]);
  return {
    ...aLista(c),
    estado: c.state,
    subtotal: c.amount_untaxed,
    impuestos: c.amount_tax,
    lineas: lineas.map<LineaCompra>((l) => ({
      id: l.id,
      productoId: l.product_id ? l.product_id[0] : null,
      producto: l.product_id ? l.product_id[1] : l.name,
      cantidad: l.product_qty,
      recibido: l.qty_received,
      unidad: l.product_uom ? l.product_uom[1] : null,
      precio: l.price_unit,
      subtotal: l.price_subtotal,
    })),
    recepciones: recepciones.map<RecepcionCompra>((r) => ({
      id: r.id,
      numero: r.name,
      estado: ESTADO_PICKING[r.state] ?? r.state,
      fecha: r.date_done ? r.date_done.slice(0, 10) : null,
    })),
    puedeRecibir: c.state === "purchase" && recepciones.some((r) => !["done", "cancel"].includes(r.state)),
  };
}

export type DetalleCompra = NonNullable<Awaited<ReturnType<typeof detalleCompra>>>;

// Productos para cargar en una compra, con el último precio pagado (o el costo si nunca se compró).
export async function buscarProductosCompra(q: string) {
  const productos = await odoo.searchRead<{ id: number; display_name: string; standard_price: number; qty_available: number; uom_po_id: Many2one }>(
    "product.product",
    ["|", ["name", "ilike", q], ["default_code", "ilike", q], ["purchase_ok", "=", true], ["active", "=", true]],
    ["id", "display_name", "standard_price", "qty_available", "uom_po_id"],
    { limit: 15, order: "name asc", context: { lang: "es_419" } },
  );
  if (!productos.length) return [];
  const ultimas = await odoo.searchRead<{ product_id: Many2one; price_unit: number }>(
    "purchase.order.line",
    [["product_id", "in", productos.map((p) => p.id)], ["state", "in", ["purchase", "done"]]],
    ["product_id", "price_unit"],
    { limit: 200, order: "id desc" },
  );
  const ultimoPrecio = new Map<number, number>();
  for (const l of ultimas) if (l.product_id && !ultimoPrecio.has(l.product_id[0])) ultimoPrecio.set(l.product_id[0], l.price_unit);
  return productos.map((p) => ({
    id: p.id,
    nombre: p.display_name,
    precio: ultimoPrecio.get(p.id) ?? p.standard_price,
    precioOrigen: ultimoPrecio.has(p.id) ? "última compra" : "costo",
    stock: p.qty_available,
    unidad: p.uom_po_id ? p.uom_po_id[1] : null,
  }));
}

export type ProductoCompra = Awaited<ReturnType<typeof buscarProductosCompra>>[number];
