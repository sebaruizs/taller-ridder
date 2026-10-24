import "server-only";
import { odoo, type Domain, type Many2one } from "./odoo";
import { chapaDe, MODELO_LINEA } from "./taller";
import {
  POR_PAGINA_INVENTARIO,
  costoApp,
  dominioProductos,
  tipoMovimiento,
  ultimasCompras,
  valorStock,
  type FiltroStock,
  type LineaCompraCosto,
  type TipoMovimiento,
  type UltimaCompra,
} from "./inventario-dominio";

type ProductoOdoo = {
  id: number;
  display_name: string;
  default_code: string | false;
  categ_id: Many2one;
  qty_available: number;
  standard_price: number;
  list_price: number;
  uom_id: Many2one;
  product_tmpl_id: Many2one;
  seller_ids: number[];
};

const CAMPOS = ["id", "display_name", "default_code", "categ_id", "qty_available", "standard_price", "list_price", "uom_id"];

export type ProductoLista = {
  id: number;
  nombre: string;
  codigo: string | null;
  categoria: string | null;
  disponible: number;
  // Costo de la app (última compra); costoOdoo es el standard_price, que la app no toca.
  costo: number;
  costoOrigen: "compra" | "odoo";
  costoFecha: string | null;
  costoProveedor: string | null;
  costoOdoo: number;
  precio: number;
  unidad: string | null;
  valor: number;
};

function aLista(p: ProductoOdoo, ultimas: Map<number, UltimaCompra>): ProductoLista {
  const c = costoApp(ultimas.get(p.id), p.standard_price);
  return {
    id: p.id,
    nombre: p.display_name,
    codigo: p.default_code || null,
    categoria: p.categ_id ? p.categ_id[1] : null,
    disponible: p.qty_available,
    costo: c.costo,
    costoOrigen: c.origen,
    costoFecha: c.fecha,
    costoProveedor: c.proveedor,
    costoOdoo: p.standard_price,
    precio: p.list_price,
    unidad: p.uom_id ? p.uom_id[1] : null,
    valor: valorStock(p.qty_available, c.costo),
  };
}

// Última compra confirmada de cada producto (o de todos si no se pasan ids). Solo lectura.
async function ultimasComprasDe(ids?: number[]): Promise<Map<number, UltimaCompra>> {
  if (ids && !ids.length) return new Map();
  const domain: Domain = [["state", "in", ["purchase", "done"]], ["product_id", "!=", false]];
  if (ids) domain.push(["product_id", "in", ids]);
  const lineas = await odoo.searchRead<LineaCompraCosto>("purchase.order.line", domain, ["product_id", "price_unit", "date_order", "partner_id"], {
    limit: 5000,
    order: "date_order desc, id desc",
  });
  return ultimasCompras(lineas);
}

export async function listarProductos(f: { q?: string; categoriaId?: number; stock?: FiltroStock; pagina: number }) {
  const domain = dominioProductos(f);
  const [total, filas] = await Promise.all([
    odoo.searchCount("product.product", domain),
    odoo.searchRead<ProductoOdoo>("product.product", domain, CAMPOS, {
      limit: POR_PAGINA_INVENTARIO,
      offset: (f.pagina - 1) * POR_PAGINA_INVENTARIO,
      order: "name asc, id asc",
    }),
  ]);
  const ultimas = await ultimasComprasDe(filas.map((p) => p.id));
  return { total, pagina: f.pagina, porPagina: POR_PAGINA_INVENTARIO, productos: filas.map((p) => aLista(p, ultimas)) };
}

// Totales del depósito (ubicaciones internas). El valor usa el costo de la app (última compra);
// valorOdoo es el que calcula Odoo con su propio costo.
export async function resumenInventario() {
  const [conStock, sinStock, porProducto, ultimas] = await Promise.all([
    odoo.searchCount("product.product", dominioProductos({ stock: "con" })),
    odoo.searchCount("product.product", dominioProductos({ stock: "sin" })),
    odoo.readGroup<{ product_id: Many2one; value: number; quantity: number }>(
      "stock.quant",
      [["location_id.usage", "=", "internal"]],
      ["product_id", "value:sum", "quantity:sum"],
      ["product_id"],
    ),
    ultimasComprasDe(),
  ]);
  const ids = porProducto.map((g) => (g.product_id ? g.product_id[0] : 0)).filter(Boolean);
  const costosOdoo = ids.length
    ? new Map((await odoo.read<{ id: number; standard_price: number }>("product.product", ids, ["id", "standard_price"])).map((p) => [p.id, p.standard_price]))
    : new Map<number, number>();
  let unidades = 0;
  let valor = 0;
  let valorOdoo = 0;
  for (const g of porProducto) {
    unidades += g.quantity;
    valorOdoo += g.value;
    if (g.product_id) valor += valorStock(g.quantity, costoApp(ultimas.get(g.product_id[0]), costosOdoo.get(g.product_id[0]) ?? 0).costo);
  }
  return { conStock, sinStock, unidades, valor, valorOdoo };
}

let cacheCategorias: { hasta: number; lista: { id: number; nombre: string; cantidad: number }[] } | undefined;

export async function categoriasInventario() {
  if (cacheCategorias && cacheCategorias.hasta > Date.now()) return cacheCategorias.lista;
  const grupos = await odoo.readGroup<{ categ_id: Many2one; categ_id_count: number }>(
    "product.product",
    dominioProductos({}),
    ["categ_id"],
    ["categ_id"],
  );
  const lista = grupos
    .filter((g) => g.categ_id)
    .map((g) => ({ id: (g.categ_id as [number, string])[0], nombre: (g.categ_id as [number, string])[1], cantidad: g.categ_id_count }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  cacheCategorias = { hasta: Date.now() + 10 * 60_000, lista };
  return lista;
}

export type CompraProducto = {
  id: number;
  orden: string;
  fecha: string | null;
  proveedor: string | null;
  cantidad: number;
  recibido: number;
  precio: number;
  subtotal: number;
};
export type MovimientoProducto = { id: number; fecha: string | null; tipo: TipoMovimiento; cantidad: number; referencia: string; origen: string | null; contacto: string | null };
export type UsoTaller = { id: number; ordenId: number; tipo: string | null; chapa: string; cantidad: number; costo: number; fecha: string | null };
export type ProveedorProducto = { id: number; proveedor: string; precio: number; minimo: number; demora: number };

export async function detalleProducto(id: number) {
  const [p] = await odoo
    .searchRead<ProductoOdoo>("product.product", [["id", "=", id], ["active", "in", [true, false]]], [...CAMPOS, "product_tmpl_id", "seller_ids"], { limit: 1 })
    .catch(() => []);
  if (!p) return null;
  return { ...aLista(p, await ultimasComprasDe([p.id])), sellerIds: p.seller_ids, tmplId: p.product_tmpl_id ? p.product_tmpl_id[0] : null };
}

export async function comprasDeProducto(id: number, sellerIds: number[]) {
  const [lineas, proveedores] = await Promise.all([
    odoo.searchRead<{ id: number; order_id: Many2one; date_order: string | false; partner_id: Many2one; product_qty: number; qty_received: number; price_unit: number; price_subtotal: number }>(
      "purchase.order.line",
      [["product_id", "=", id], ["state", "in", ["purchase", "done"]]],
      ["id", "order_id", "date_order", "partner_id", "product_qty", "qty_received", "price_unit", "price_subtotal"],
      { limit: 50, order: "date_order desc, id desc" },
    ),
    sellerIds.length
      ? odoo.read<{ id: number; partner_id: Many2one; price: number; min_qty: number; delay: number }>("product.supplierinfo", sellerIds, ["id", "partner_id", "price", "min_qty", "delay"])
      : Promise.resolve([]),
  ]);
  return {
    compras: lineas.map<CompraProducto>((l) => ({
      id: l.id,
      orden: l.order_id ? l.order_id[1] : "—",
      fecha: l.date_order ? l.date_order.slice(0, 10) : null,
      proveedor: l.partner_id ? l.partner_id[1] : null,
      cantidad: l.product_qty,
      recibido: l.qty_received,
      precio: l.price_unit,
      subtotal: l.price_subtotal,
    })),
    proveedores: proveedores.map<ProveedorProducto>((s) => ({
      id: s.id,
      proveedor: s.partner_id ? s.partner_id[1] : "—",
      precio: s.price,
      minimo: s.min_qty,
      demora: s.delay,
    })),
  };
}

let cacheInternas: { hasta: number; ids: Set<number> } | undefined;

async function ubicacionesInternas(): Promise<Set<number>> {
  if (cacheInternas && cacheInternas.hasta > Date.now()) return cacheInternas.ids;
  const filas = await odoo.searchRead<{ id: number }>("stock.location", [["usage", "=", "internal"]], ["id"], { limit: 200 });
  cacheInternas = { hasta: Date.now() + 60 * 60_000, ids: new Set(filas.map((f) => f.id)) };
  return cacheInternas.ids;
}

export async function movimientosDeProducto(id: number): Promise<MovimientoProducto[]> {
  const [internas, movs] = await Promise.all([
    ubicacionesInternas(),
    odoo.searchRead<{ id: number; date: string | false; reference: string | false; origin: string | false; quantity: number; location_id: Many2one; location_dest_id: Many2one; picking_id: Many2one; partner_id: Many2one }>(
      "stock.move",
      [["product_id", "=", id], ["state", "=", "done"]],
      ["id", "date", "reference", "origin", "quantity", "location_id", "location_dest_id", "picking_id", "partner_id"],
      { limit: 50, order: "date desc, id desc" },
    ),
  ]);
  const pickingIds = [...new Set(movs.map((m) => (m.picking_id ? m.picking_id[0] : 0)).filter(Boolean))];
  const pickings = pickingIds.length
    ? await odoo.read<{ id: number; partner_id: Many2one }>("stock.picking", pickingIds, ["id", "partner_id"])
    : [];
  const contactoPorPicking = new Map(pickings.map((p) => [p.id, p.partner_id ? p.partner_id[1] : null]));
  return movs.map((m) => ({
    id: m.id,
    fecha: m.date ? m.date.slice(0, 10) : null,
    tipo: tipoMovimiento(Boolean(m.location_id && internas.has(m.location_id[0])), Boolean(m.location_dest_id && internas.has(m.location_dest_id[0]))),
    cantidad: m.quantity,
    referencia: m.reference || "—",
    origen: m.origin || null,
    contacto: (m.picking_id && contactoPorPicking.get(m.picking_id[0])) || (m.partner_id ? m.partner_id[1] : null),
  }));
}

export async function usoEnTaller(id: number): Promise<UsoTaller[]> {
  const lineas = await odoo.searchRead<{ id: number; service_id: Many2one; quantity: number; total_cost: number; create_date: string | false }>(
    MODELO_LINEA,
    [["product_id", "=", id]],
    ["id", "service_id", "quantity", "total_cost", "create_date"],
    { limit: 50, order: "id desc" },
  );
  const ordenIds = [...new Set(lineas.map((l) => (l.service_id ? l.service_id[0] : 0)).filter(Boolean))];
  const ordenes = ordenIds.length
    ? await odoo.read<{ id: number; vehicle_id: Many2one; service_type_id: Many2one }>("fleet.vehicle.log.services", ordenIds, ["id", "vehicle_id", "service_type_id"])
    : [];
  const porId = new Map(ordenes.map((o) => [o.id, o]));
  return lineas
    .filter((l) => l.service_id)
    .map((l) => {
      const o = porId.get((l.service_id as [number, string])[0]);
      return {
        id: l.id,
        ordenId: (l.service_id as [number, string])[0],
        tipo: o?.service_type_id ? o.service_type_id[1] : null,
        chapa: o?.vehicle_id ? chapaDe({ license_plate: false, display_name: o.vehicle_id[1] }) : "—",
        cantidad: l.quantity,
        costo: l.total_cost,
        fecha: l.create_date ? l.create_date.slice(0, 10) : null,
      };
    });
}

export async function categoriasOdoo(): Promise<{ id: number; nombre: string }[]> {
  const filas = await odoo.searchRead<{ id: number; complete_name: string }>("product.category", [], ["id", "complete_name"], { limit: 200, order: "complete_name asc" });
  return filas.map((c) => ({ id: c.id, nombre: c.complete_name }));
}

// Proveedores: los marcados como tal en Odoo y los que ya tienen órdenes de compra.
export async function proveedoresOdoo(): Promise<{ id: number; nombre: string }[]> {
  const [marcados, conCompras] = await Promise.all([
    odoo.searchRead<{ id: number; name: string }>("res.partner", [["supplier_rank", ">", 0]], ["id", "name"], { limit: 300 }),
    odoo.readGroup<{ partner_id: Many2one }>("purchase.order", [], ["partner_id"], ["partner_id"]),
  ]);
  const mapa = new Map(marcados.map((p) => [p.id, p.name]));
  for (const g of conCompras) if (g.partner_id) mapa.set(g.partner_id[0], g.partner_id[1]);
  return [...mapa].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
}
