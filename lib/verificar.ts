// Verificación del jefe de taller: repuestos de una orden "Listo para verificar" y aprobación.
import type { Many2one, OdooClient } from "./odoo";
import {
  ESTADO_AL_APROBAR,
  MODELO_LINEA,
  MODELO_ORDEN,
  chapaDe,
  conAutor,
  mensajeTelegramError,
  mensajeTelegramVerificado,
  payloadLineaRepuesto,
  payloadNotaVerificacion,
  type EstadoOrden,
  type LineaRepuesto,
} from "./taller";

export type OdooVerificar = Pick<OdooClient, "read" | "searchRead" | "create" | "write" | "unlink" | "messagePost">;

export class NoVerificable extends Error {}

type OrdenVerif = { id: number; state: EstadoOrden; vehicle_id: Many2one; service_type_id: Many2one; total_products_cost: number };

export async function ordenParaVerificar(odoo: OdooVerificar, ordenId: number): Promise<OrdenVerif> {
  const [o] = await odoo.read<OrdenVerif>(MODELO_ORDEN, [ordenId], ["id", "state", "vehicle_id", "service_type_id", "total_products_cost"]);
  if (!o) throw new NoVerificable("La orden no existe en Odoo");
  if (o.state !== "cancelled") throw new NoVerificable("Esta orden ya no está en «Listo para verificar». Actualizá la lista.");
  return o;
}

export async function leerRepuestos(odoo: Pick<OdooClient, "searchRead">, ordenId: number): Promise<LineaRepuesto[]> {
  const filas = await odoo.searchRead<{ id: number; product_id: Many2one; quantity: number; unit_cost: number; total_cost: number }>(
    MODELO_LINEA,
    [["service_id", "=", ordenId]],
    ["id", "product_id", "quantity", "unit_cost", "total_cost"],
    { limit: 200, order: "id asc" },
  );
  return filas.map((l) => ({
    id: l.id,
    producto: l.product_id ? l.product_id[1] : "—",
    productoId: l.product_id ? l.product_id[0] : 0,
    cantidad: l.quantity,
    costoUnitario: l.unit_cost,
    total: l.total_cost,
  }));
}

// El costo de la orden (amount) es el total de repuestos, igual que al finalizar.
async function sincronizarCosto(odoo: OdooVerificar, ordenId: number): Promise<number> {
  const [o] = await odoo.read<{ total_products_cost: number }>(MODELO_ORDEN, [ordenId], ["total_products_cost"]);
  const total = o?.total_products_cost || 0;
  await odoo.write(MODELO_ORDEN, [ordenId], { amount: total });
  return total;
}

export async function agregarRepuesto(
  odoo: OdooVerificar,
  ordenId: number,
  datos: { productoId: number; cantidad: number; costoUnitario: number },
): Promise<{ lineas: LineaRepuesto[]; producto: string }> {
  await ordenParaVerificar(odoo, ordenId);
  const [prod] = await odoo.searchRead<{ id: number; display_name: string }>(
    "product.product",
    [["id", "=", datos.productoId], ["active", "=", true]],
    ["id", "display_name"],
    { limit: 1 },
  );
  if (!prod) throw new NoVerificable("Ese producto no existe o está archivado en Odoo");
  await odoo.create(MODELO_LINEA, payloadLineaRepuesto(ordenId, datos));
  await sincronizarCosto(odoo, ordenId);
  return { lineas: await leerRepuestos(odoo, ordenId), producto: prod.display_name };
}

export async function quitarRepuesto(odoo: OdooVerificar, ordenId: number, lineaId: number): Promise<{ lineas: LineaRepuesto[]; quitada: LineaRepuesto }> {
  await ordenParaVerificar(odoo, ordenId);
  const quitada = (await leerRepuestos(odoo, ordenId)).find((l) => l.id === lineaId);
  if (!quitada) throw new NoVerificable("Ese repuesto no es de esta orden");
  await odoo.unlink(MODELO_LINEA, [lineaId]);
  await sincronizarCosto(odoo, ordenId);
  return { lineas: await leerRepuestos(odoo, ordenId), quitada };
}

export type DepsAprobar = {
  odoo: OdooVerificar;
  telegram: (chatId: string, texto: string) => Promise<void>;
  autor: string;
  autorPartnerId?: number | null;
  config: { chatTaller: string; chatErrores: string };
};

export async function aprobarOrden(deps: DepsAprobar, ordenId: number, confirmaSinRepuestos: boolean) {
  const { odoo, config } = deps;
  const orden = await ordenParaVerificar(odoo, ordenId);
  const lineas = await leerRepuestos(odoo, ordenId);
  if (!lineas.length && !confirmaSinRepuestos) throw new NoVerificable("Cargá los repuestos o confirmá que no se usó ninguno");

  const [actual] = await odoo.read<{ total_products_cost: number }>(MODELO_ORDEN, [ordenId], ["total_products_cost"]);
  await odoo.write(MODELO_ORDEN, [ordenId], { amount: actual?.total_products_cost || 0, state: ESTADO_AL_APROBAR });

  const chapa = orden.vehicle_id ? chapaDe({ license_plate: false, display_name: orden.vehicle_id[1] }) : `#${ordenId}`;
  const tipo = orden.service_type_id ? orden.service_type_id[1] : null;
  const avisos: string[] = [];
  try {
    await odoo.messagePost(MODELO_ORDEN, ordenId, conAutor(payloadNotaVerificacion({ autor: deps.autor, lineas }), deps.autorPartnerId));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    avisos.push(`No se pudo publicar la nota de seguimiento: ${msg}`);
    await deps.telegram(config.chatErrores, mensajeTelegramError({ chapa, ordenId, paso: "nota de verificación", error: msg })).catch(() => {});
  }
  try {
    await deps.telegram(config.chatTaller, mensajeTelegramVerificado({ autor: deps.autor, chapa, tipo, lineas }));
  } catch {
    avisos.push("No se pudo avisar por Telegram");
  }
  return { chapa, lineas, avisos };
}
