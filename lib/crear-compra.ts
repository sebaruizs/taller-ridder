// Compra nueva en Odoo: crear → confirmar → (opcional) recibir. Se puede reintentar sin duplicar.
import type { Domain, Many2one, OdooClient } from "./odoo";
import { conAutor } from "./taller";
import { ProductoDuplicado, type ProductoExistente } from "./crear-producto";
import { origenApp, payloadCompra, payloadNotaCompra, payloadNotaRecepcion, type DatosCompra } from "./compras-dominio";

export type OdooCompras = Pick<OdooClient, "searchRead" | "create" | "boton" | "messagePost">;

export class CompraInvalida extends Error {}

export type Autor = { nombre: string; partnerId: number | null };

// Valida todas las recepciones abiertas de la compra. Devuelve un aviso si alguna no quedó hecha.
export async function recibirCompra(odoo: OdooCompras, compraId: number, autor: Autor): Promise<string | null> {
  const [c] = await odoo.searchRead<{ id: number; state: string; picking_ids: number[] }>("purchase.order", [["id", "=", compraId]], ["id", "state", "picking_ids"], { limit: 1 });
  if (!c) throw new CompraInvalida("La compra no existe en Odoo");
  if (c.state !== "purchase") throw new CompraInvalida("La compra no está confirmada");
  const abiertas = c.picking_ids.length
    ? await odoo.searchRead<{ id: number; state: string }>("stock.picking", [["id", "in", c.picking_ids], ["state", "not in", ["done", "cancel"]]], ["id", "state"], { limit: 20 })
    : [];
  if (!abiertas.length) throw new CompraInvalida("No hay nada pendiente de recibir en esta compra");

  for (const p of abiertas) {
    // Una recepción que no está lista se intenta reservar primero.
    if (p.state !== "assigned") await odoo.boton("stock.picking", "action_assign", [p.id]);
    await odoo.boton("stock.picking", "button_validate", [p.id]);
  }
  const quedan = await odoo.searchRead<{ id: number }>("stock.picking", [["id", "in", abiertas.map((p) => p.id)], ["state", "!=", "done"]], ["id"], { limit: 20 });
  if (quedan.length) return "Odoo no terminó de validar la recepción (puede pedir confirmar cantidades). Revisala en Odoo.";

  await odoo.messagePost("purchase.order", compraId, conAutor(payloadNotaRecepcion(autor.nombre), autor.partnerId)).catch(() => {});
  return null;
}

export type ResultadoCompra = { compraId: number; numero: string; recibida: boolean; avisos: string[] };

export async function crearCompra(d: DatosCompra, odoo: OdooCompras, autor: Autor, ahora: string): Promise<ResultadoCompra> {
  if (!d.lineas.length) throw new CompraInvalida("Agregá al menos un producto");

  const [proveedor] = await odoo.searchRead<{ id: number }>("res.partner", [["id", "=", d.proveedorId]], ["id"], { limit: 1 });
  if (!proveedor) throw new CompraInvalida("El proveedor no existe en Odoo");
  const ids = [...new Set(d.lineas.map((l) => l.productoId))];
  const productos = await odoo.searchRead<{ id: number }>("product.product", [["id", "in", ids], ["purchase_ok", "=", true]], ["id"], { limit: ids.length });
  if (productos.length !== ids.length) throw new CompraInvalida("Algún producto no existe o no se puede comprar");

  const avisos: string[] = [];
  const buscar = () =>
    odoo.searchRead<{ id: number; name: string; state: string; receipt_status: string | false }>(
      "purchase.order",
      [["origin", "=", origenApp(d.clave)]],
      ["id", "name", "state", "receipt_status"],
      { limit: 1 },
    );

  let [compra] = await buscar();
  const nueva = !compra;
  if (!compra) {
    await odoo.create("purchase.order", payloadCompra(d, ahora));
    [compra] = await buscar();
  }
  if (compra.state === "draft" || compra.state === "sent") {
    await odoo.boton("purchase.order", "button_confirm", [compra.id]);
    [compra] = await buscar();
  }
  if (nueva) {
    await odoo
      .messagePost("purchase.order", compra.id, conAutor(payloadNotaCompra({ autor: autor.nombre, lineas: d.lineas, recibir: d.recibir }), autor.partnerId))
      .catch((e) => avisos.push(`No se pudo publicar la nota de seguimiento: ${e instanceof Error ? e.message : String(e)}`));
  }

  let recibida = compra.receipt_status === "full";
  if (d.recibir && !recibida && compra.state === "purchase") {
    try {
      const aviso = await recibirCompra(odoo, compra.id, autor);
      if (aviso) avisos.push(aviso);
      else recibida = true;
    } catch (e) {
      avisos.push(`La compra quedó confirmada pero no se pudo recibir: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { compraId: compra.id, numero: compra.name, recibida, avisos };
}

// Productos para cargar en una compra, con el último precio pagado (o el costo si nunca se compró).
export async function productosCompra(odoo: Pick<OdooClient, "searchRead">, domain: Domain, limit = 15) {
  const productos = await odoo.searchRead<{ id: number; display_name: string; standard_price: number; qty_available: number; uom_po_id: Many2one }>(
    "product.product",
    [...domain, ["purchase_ok", "=", true], ["active", "=", true]],
    ["id", "display_name", "standard_price", "qty_available", "uom_po_id"],
    { limit, order: "name asc", context: { lang: "es_419" } },
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

export type ProductoCompra = Awaited<ReturnType<typeof productosCompra>>[number];

export type ProductoNuevoEnCompra =
  | { creado: true; producto: ProductoCompra; avisos: string[] }
  | { creado: false; existentes: ProductoExistente[]; productos: ProductoCompra[] };

// Alta de un producto desde «Nueva compra»: lo devuelve listo para agregar como línea.
// Si ya existe, devuelve los existentes que se pueden comprar para agregarlos en su lugar.
export async function productoNuevoEnCompra(
  crear: () => Promise<{ productoId: number; avisos: string[] }>,
  odoo: Pick<OdooClient, "searchRead">,
): Promise<ProductoNuevoEnCompra> {
  try {
    const { productoId, avisos } = await crear();
    const [producto] = await productosCompra(odoo, [["id", "=", productoId]], 1);
    if (!producto) throw new CompraInvalida("El producto se creó pero Odoo no lo deja comprar. Revisalo en Inventario.");
    return { creado: true, producto, avisos };
  } catch (e) {
    if (!(e instanceof ProductoDuplicado)) throw e;
    const ids = e.existentes.map((p) => p.id);
    return { creado: false, existentes: e.existentes, productos: await productosCompra(odoo, [["id", "in", ids]], ids.length) };
  }
}
