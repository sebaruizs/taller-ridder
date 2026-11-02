import type { Many2one, OdooClient } from "./odoo";
import { ESTADOS, MODELO_ORDEN, chapaDe, conAutor, movimientoValido, payloadNotaCambioEstado, payloadNotaCambioMecanico, type EstadoOrden } from "./taller";

export { MOVIMIENTOS, movimientoValido } from "./taller";
import { NoVerificable } from "./verificar";

type OdooTablero = Pick<OdooClient, "read" | "write" | "messagePost">;

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

// Borra la orden en Odoo; sus repuestos se borran con ella. Las finalizadas quedan como historial.
export async function eliminarOrden(odoo: Pick<OdooClient, "read" | "unlink">, ordenId: number) {
  const [o] = await odoo.read<{ id: number; state: EstadoOrden; vehicle_id: Many2one; service_type_id: Many2one }>(MODELO_ORDEN, [ordenId], ["id", "state", "vehicle_id", "service_type_id"]);
  if (!o) throw new NoVerificable("La orden no existe en Odoo");
  if (o.state === "done") throw new NoVerificable("Las órdenes finalizadas no se pueden eliminar");
  await odoo.unlink(MODELO_ORDEN, [ordenId]);
  return {
    chapa: o.vehicle_id ? chapaDe({ license_plate: false, display_name: o.vehicle_id[1] }) : `#${ordenId}`,
    estado: o.state,
    tipo: o.service_type_id ? o.service_type_id[1] : null,
  };
}

// Corrige quién hizo el trabajo (vendor_id). Deja una nota en la orden a nombre de quien lo cambió; si la nota
// falla, el cambio queda igual y se avisa.
export async function cambiarMecanico(
  odoo: OdooTablero,
  ordenId: number,
  mecanico: { id: number; nombre: string },
  autor: string,
  autorPartnerId: number | null = null,
) {
  const [o] = await odoo.read<{ id: number; vendor_id: Many2one; vehicle_id: Many2one }>(MODELO_ORDEN, [ordenId], ["id", "vendor_id", "vehicle_id"]);
  if (!o) throw new NoVerificable("La orden no existe en Odoo");
  if (o.vendor_id && o.vendor_id[0] === mecanico.id) throw new NoVerificable(`Ya figura ${mecanico.nombre} como mecánico`);
  const de = o.vendor_id ? o.vendor_id[1] : null;
  await odoo.write(MODELO_ORDEN, [ordenId], { vendor_id: mecanico.id });
  let aviso: string | null = null;
  try {
    await odoo.messagePost(MODELO_ORDEN, ordenId, conAutor(payloadNotaCambioMecanico({ autor, de, a: mecanico.nombre }), autorPartnerId));
  } catch (e) {
    aviso = `No se pudo publicar la nota en la orden: ${e instanceof Error ? e.message : String(e)}`;
  }
  return { chapa: o.vehicle_id ? chapaDe({ license_plate: false, display_name: o.vehicle_id[1] }) : `#${ordenId}`, de, a: mecanico.nombre, aviso };
}
