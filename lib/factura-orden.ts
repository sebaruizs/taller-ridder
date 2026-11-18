import "server-only";
import type { Many2one, OdooClient } from "./odoo";
import { NOTA_INTERNA, conAutor, escaparHtml } from "./taller";
import { planFactura, seFactura, type CambioFactura, type Situacion } from "./factura-orden-dominio";

export type OdooFactura = Pick<OdooClient, "searchRead" | "read" | "write" | "messagePost">;

const NO_SE_PUDO = "El repuesto se guardó, pero no se pudo actualizar la factura en borrador. Revisala en Odoo.";

async function situacion(odoo: OdooFactura, ordenId: number): Promise<Situacion> {
  const ventas = await odoo.searchRead<{ id: number; invoice_ids: number[] }>(
    "sale.order",
    [["fleet_service_id", "=", ordenId], ["state", "!=", "cancel"]],
    ["id", "invoice_ids"],
    { limit: 5 },
  );
  const vacia = { ventas: ventas.length, facturas: [], lineas: [] };
  if (ventas.length !== 1 || !ventas[0].invoice_ids.length) return vacia;
  const movs = await odoo.read<{ id: number; name: string | false; state: string; move_type: string }>("account.move", ventas[0].invoice_ids, ["id", "name", "state", "move_type"]);
  const facturas = movs.filter((m) => m.move_type === "out_invoice" && m.state !== "cancel").map((m) => ({ id: m.id, nombre: m.name && m.name !== "/" ? m.name : null, estado: m.state }));
  if (facturas.length !== 1 || facturas[0].estado !== "draft") return { ...vacia, facturas };
  const lineas = await odoo.searchRead<{ id: number; product_id: Many2one; quantity: number }>(
    "account.move.line",
    [["move_id", "=", facturas[0].id], ["display_type", "=", "product"]],
    ["id", "product_id", "quantity"],
    { limit: 500 },
  );
  return { ventas: 1, facturas, lineas: lineas.map((l) => ({ id: l.id, productoId: l.product_id ? l.product_id[0] : 0, cantidad: l.quantity })) };
}

/**
 * Después de cambiar un repuesto de una orden: si la orden ya tiene su factura en borrador, lleva ese cambio a la factura
 * (cantidad y costo unitario de la orden).
 * Devuelve el aviso para mostrar en pantalla (o null). No tira: el repuesto ya está guardado cuando esto corre, y un
 * error acá no puede hacer que la persona reintente y lo cargue dos veces.
 */
export async function actualizarFactura(odoo: OdooFactura, ordenId: number, c: CambioFactura, autor: { nombre: string; odooPartnerId: number | null }): Promise<{ aviso: string | null; hecho: string | null }> {
  if (!seFactura(c.producto)) return { aviso: null, hecho: null };
  let plan;
  try {
    plan = planFactura(c, await situacion(odoo, ordenId));
    if (plan.accion === "nada") return { aviso: null, hecho: null };
    if (plan.accion === "aviso") return { aviso: plan.aviso, hecho: null };
    await odoo.write("account.move", [plan.facturaId], { invoice_line_ids: plan.comandos });
  } catch (e) {
    console.error(`[factura] orden ${ordenId}: no se pudo actualizar la factura`, e);
    return { aviso: NO_SE_PUDO, hecho: null };
  }
  // La nota no es crítica: la factura ya quedó actualizada.
  try {
    const body = `<p>Factura actualizada desde la orden de taller #${ordenId} por <b>${escaparHtml(autor.nombre)}</b>: ${escaparHtml(plan.hecho)} (app del taller).</p>`;
    await odoo.messagePost("account.move", plan.facturaId, conAutor({ body, ...NOTA_INTERNA }, autor.odooPartnerId));
  } catch (e) {
    console.error(`[factura] orden ${ordenId}: no se pudo publicar la nota en la factura`, e);
  }
  return { aviso: plan.aviso ?? null, hecho: plan.hecho };
}
