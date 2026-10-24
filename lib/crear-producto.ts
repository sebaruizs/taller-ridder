// Alta de productos en Odoo desde Inventario. Sin estado propio: todo queda en Odoo.
import type { Domain, Many2one, OdooClient } from "./odoo";
import { NOTA_INTERNA, conAutor, escaparHtml } from "./taller";

export type DatosProducto = {
  nombre: string;
  categoriaId: number;
  codigo: string | null;
  costo: number;
  precio: number;
  proveedorId: number | null;
};

// Configuración que se copia del último producto cargado (impuestos, ruta de compra, facturación).
export type Plantilla = {
  taxes_id: number[];
  supplier_taxes_id: number[];
  route_ids: number[];
  purchase_method: string | false;
  invoice_policy: string | false;
  uom_id: Many2one;
};

export type ProductoExistente = { id: number; nombre: string; codigo: string | null };

export class ProductoDuplicado extends Error {
  constructor(readonly existentes: ProductoExistente[]) {
    super("Ya existe un producto con ese nombre o código");
  }
}

export class ProductoInvalido extends Error {}

export function payloadProducto(d: DatosProducto, p: Plantilla | null) {
  const vals: Record<string, unknown> = {
    name: d.nombre.trim(),
    categ_id: d.categoriaId,
    type: "consu",
    is_storable: true,
    sale_ok: true,
    purchase_ok: true,
    standard_price: d.costo,
    list_price: d.precio,
  };
  if (d.codigo?.trim()) vals.default_code = d.codigo.trim();
  if (p) {
    vals.taxes_id = [[6, 0, p.taxes_id]];
    vals.supplier_taxes_id = [[6, 0, p.supplier_taxes_id]];
    vals.route_ids = [[6, 0, p.route_ids]];
    if (p.purchase_method) vals.purchase_method = p.purchase_method;
    if (p.invoice_policy) vals.invoice_policy = p.invoice_policy;
    if (p.uom_id) {
      vals.uom_id = p.uom_id[0];
      vals.uom_po_id = p.uom_id[0];
    }
  }
  return vals;
}

export function payloadProveedor(tmplId: number, proveedorId: number, precio: number) {
  return { product_tmpl_id: tmplId, partner_id: proveedorId, price: precio, min_qty: 1 };
}

export function payloadNotaProducto(p: { autor: string; costo: number; precio: number; proveedor: string | null }) {
  const gs = (n: number) => `Gs. ${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n)}`;
  return {
    body:
      `<p><b>Producto creado por ${escaparHtml(p.autor)}</b> (app del taller).</p>` +
      `<p>Costo: ${gs(p.costo)} · Precio de venta: ${gs(p.precio)}` +
      (p.proveedor ? ` · Proveedor: ${escaparHtml(p.proveedor)}` : "") +
      `</p>`,
    ...NOTA_INTERNA,
  };
}

export type DepsProducto = {
  odoo: Pick<OdooClient, "searchRead" | "read" | "create" | "messagePost">;
  autor: string;
  autorPartnerId?: number | null;
};

export async function crearProducto(d: DatosProducto, deps: DepsProducto): Promise<{ productoId: number; avisos: string[] }> {
  const { odoo } = deps;
  const nombre = d.nombre.trim();
  const codigo = d.codigo?.trim() || null;

  // Duplicados: mismo nombre (sin importar mayúsculas) o mismo código, incluidos archivados.
  const dominio: Domain = codigo ? ["|", ["name", "=ilike", nombre], ["default_code", "=ilike", codigo]] : [["name", "=ilike", nombre]];
  const existentes = await odoo.searchRead<{ id: number; display_name: string; default_code: string | false }>(
    "product.product",
    [...dominio, ["active", "in", [true, false]]],
    ["id", "display_name", "default_code"],
    { limit: 5 },
  );
  if (existentes.length) {
    throw new ProductoDuplicado(existentes.map((e) => ({ id: e.id, nombre: e.display_name, codigo: e.default_code || null })));
  }

  const [categoria] = await odoo.searchRead<{ id: number }>("product.category", [["id", "=", d.categoriaId]], ["id"], { limit: 1 });
  if (!categoria) throw new ProductoInvalido("La categoría no existe en Odoo");

  let proveedor: string | null = null;
  if (d.proveedorId) {
    const [prov] = await odoo.searchRead<{ id: number; name: string }>("res.partner", [["id", "=", d.proveedorId]], ["id", "name"], { limit: 1 });
    if (!prov) throw new ProductoInvalido("El proveedor no existe en Odoo");
    proveedor = prov.name;
  }

  const [plantilla] = await odoo.searchRead<Plantilla>(
    "product.template",
    [["is_storable", "=", true], ["active", "=", true]],
    ["taxes_id", "supplier_taxes_id", "route_ids", "purchase_method", "invoice_policy", "uom_id"],
    { limit: 1, order: "id desc" },
  );

  const productoId = await odoo.create("product.product", payloadProducto({ ...d, nombre, codigo }, plantilla ?? null));
  const [creado] = await odoo.read<{ product_tmpl_id: Many2one }>("product.product", [productoId], ["product_tmpl_id"]);
  const tmplId = creado?.product_tmpl_id ? creado.product_tmpl_id[0] : null;

  // El producto ya existe: lo que falle desde acá se avisa, no se deshace.
  const avisos: string[] = [];
  if (tmplId && d.proveedorId) {
    await odoo.create("product.supplierinfo", payloadProveedor(tmplId, d.proveedorId, d.costo)).catch((e) => {
      avisos.push(`No se pudo cargar el proveedor: ${e instanceof Error ? e.message : String(e)}`);
    });
  }
  if (tmplId) {
    await odoo
      .messagePost("product.template", tmplId, conAutor(payloadNotaProducto({ autor: deps.autor, costo: d.costo, precio: d.precio, proveedor }), deps.autorPartnerId))
      .catch((e) => avisos.push(`No se pudo publicar la nota de seguimiento: ${e instanceof Error ? e.message : String(e)}`));
  }
  return { productoId, avisos };
}
