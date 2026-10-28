import type { Many2one, OdooClient } from "./odoo";
import { ESTADOS, MODELO_ORDEN, chapaDe, conAutor, payloadNotaCambioEstado, type EstadoOrden } from "./taller";
import { NoVerificable } from "./verificar";

type OdooTablero = Pick<OdooClient, "read" | "write" | "messagePost">;

// Cambios de estado directos del tablero. Reportar (En proceso → Listo para verificar) y aprobar
// tienen su propio formulario y no pasan por acá.
export const MOVIMIENTOS: Partial<Record<EstadoOrden, readonly EstadoOrden[]>> = {
  new: ["running"],
  running: ["to_be_paid"],
  to_be_paid: ["running"],
};

export function movimientoValido(de: EstadoOrden, a: EstadoOrden): boolean {
  return MOVIMIENTOS[de]?.includes(a) ?? false;
}

// La nota de seguimiento no es crítica: si falla, el cambio de estado queda igual.
export async function moverOrden(odoo: OdooTablero, ordenId: number, de: EstadoOrden, a: EstadoOrden, autor: string, autorPartnerId: number | null = null) {
  if (!movimientoValido(de, a)) throw new NoVerificable(`No se puede pasar de «${ESTADOS[de]}» a «${ESTADOS[a]}» desde el tablero`);
  const [o] = await odoo.read<{ id: number; state: EstadoOrden; vehicle_id: Many2one }>(MODELO_ORDEN, [ordenId], ["id", "state", "vehicle_id"]);
  if (!o) throw new NoVerificable("La orden no existe en Odoo");
  if (o.state !== de) throw new NoVerificable(`Esta orden ya no está en «${ESTADOS[de]}». Actualizá el tablero.`);
  await odoo.write(MODELO_ORDEN, [ordenId], { state: a });
  let aviso: string | null = null;
  try {
    await odoo.messagePost(MODELO_ORDEN, ordenId, conAutor(payloadNotaCambioEstado({ autor, de, a }), autorPartnerId));
  } catch (e) {
    aviso = `No se pudo publicar la nota de seguimiento: ${e instanceof Error ? e.message : String(e)}`;
  }
  return { chapa: o.vehicle_id ? chapaDe({ license_plate: false, display_name: o.vehicle_id[1] }) : `#${ordenId}`, aviso };
}

// Nuevo → En proceso.
export function iniciarOrden(odoo: OdooTablero, ordenId: number, autor: string, autorPartnerId: number | null = null) {
  return moverOrden(odoo, ordenId, "new", "running", autor, autorPartnerId);
}
