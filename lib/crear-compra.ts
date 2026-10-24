// Compra nueva en Odoo: crear → confirmar → (opcional) recibir. Se puede reintentar sin duplicar.
import type { OdooClient } from "./odoo";
import { conAutor } from "./taller";
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
