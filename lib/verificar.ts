// Verificación del jefe de taller: repuestos de una orden (en cualquier estado) y aprobación ("Listo para verificar").
import type { Many2one, OdooClient } from "./odoo";
import { choferQueCorresponde } from "./chofer-orden";
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

type OrdenVerif = {
  id: number;
  state: EstadoOrden;
  vehicle_id: Many2one;
  service_type_id: Many2one;
  total_products_cost: number;
  purchaser_id?: Many2one;
  date?: string | false;
};

export async function ordenParaVerificar(odoo: OdooVerificar, ordenId: number): Promise<OrdenVerif> {
  const [o] = await odoo.read<OrdenVerif>(MODELO_ORDEN, [ordenId], ["id", "state", "vehicle_id", "service_type_id", "total_products_cost", "purchaser_id", "date"]);
  if (!o) throw new NoVerificable("La orden no existe en Odoo");
  if (o.state !== "cancelled") throw new NoVerificable("Esta orden ya no está en «Listo para verificar». Actualizá la lista.");
  return o;
}

// Los repuestos se pueden cargar en cualquier momento: con la orden nueva, en proceso, bloqueada o ya cerrada.
async function ordenExistente(odoo: OdooVerificar, ordenId: number): Promise<void> {
  const [o] = await odoo.read<{ id: number }>(MODELO_ORDEN, [ordenId], ["id"]);
  if (!o) throw new NoVerificable("La orden no existe en Odoo");
}

export async function leerRepuestos(odoo: Pick<OdooClient, "searchRead">, ordenId: number): Promise<LineaRepuesto[]> {
  const filas = await odoo.searchRead<{ id: number; product_id: Many2one; quantity: number; product_uom_id?: Many2one; unit_cost: number; total_cost: number }>(
    MODELO_LINEA,
    [["service_id", "=", ordenId]],
    ["id", "product_id", "quantity", "product_uom_id", "unit_cost", "total_cost"],
    // En español, como en Odoo: «Unidades» y no «Units».
    { limit: 200, order: "id asc", context: { lang: "es_419" } },
  );
  return filas.map((l) => ({
    id: l.id,
    producto: l.product_id ? l.product_id[1] : "—",
    productoId: l.product_id ? l.product_id[0] : 0,
    cantidad: l.quantity,
    unidad: l.product_uom_id ? l.product_uom_id[1] : null,
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
  await ordenExistente(odoo, ordenId);
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
  await ordenExistente(odoo, ordenId);
  const quitada = (await leerRepuestos(odoo, ordenId)).find((l) => l.id === lineaId);
  if (!quitada) throw new NoVerificable("Ese repuesto no es de esta orden");
  await odoo.unlink(MODELO_LINEA, [lineaId]);
  await sincronizarCosto(odoo, ordenId);
  return { lineas: await leerRepuestos(odoo, ordenId), quitada };
}

// Corregir cantidad o costo de una línea, como al editar la fila en Odoo.
export async function editarRepuesto(
  odoo: OdooVerificar,
  ordenId: number,
  lineaId: number,
  datos: { cantidad: number; costoUnitario: number },
): Promise<{ lineas: LineaRepuesto[]; antes: LineaRepuesto }> {
  await ordenExistente(odoo, ordenId);
  const antes = (await leerRepuestos(odoo, ordenId)).find((l) => l.id === lineaId);
  if (!antes) throw new NoVerificable("Ese repuesto no es de esta orden");
  await odoo.write(MODELO_LINEA, [lineaId], { quantity: datos.cantidad, unit_cost: datos.costoUnitario });
  await sincronizarCosto(odoo, ordenId);
  return { lineas: await leerRepuestos(odoo, ordenId), antes };
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

  // Si llegó sin chofer (por ejemplo, pasada a «Listo para verificar» desde Odoo): el que tenía la moto en la
  // fecha de la orden; si nunca tuvo, queda vacío.
  const choferId = !orden.purchaser_id && orden.vehicle_id ? await choferQueCorresponde(odoo, orden.vehicle_id[0], orden.date ?? false) : null;
  const [actual] = await odoo.read<{ total_products_cost: number }>(MODELO_ORDEN, [ordenId], ["total_products_cost"]);
  await odoo.write(MODELO_ORDEN, [ordenId], {
    amount: actual?.total_products_cost || 0,
    state: ESTADO_AL_APROBAR,
    ...(choferId ? { purchaser_id: choferId } : {}),
  });

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
