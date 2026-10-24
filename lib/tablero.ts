import type { Many2one, OdooClient } from "./odoo";
import { MODELO_ORDEN, chapaDe, conAutor, payloadNotaCambioEstado, type EstadoOrden } from "./taller";
import { NoVerificable } from "./verificar";

// Nuevo → En proceso. La nota de seguimiento no es crítica: si falla, el cambio de estado queda igual.
export async function iniciarOrden(
  odoo: Pick<OdooClient, "read" | "write" | "messagePost">,
  ordenId: number,
  autor: string,
  autorPartnerId: number | null = null,
) {
  const [o] = await odoo.read<{ id: number; state: EstadoOrden; vehicle_id: Many2one }>(MODELO_ORDEN, [ordenId], ["id", "state", "vehicle_id"]);
  if (!o) throw new NoVerificable("La orden no existe en Odoo");
  if (o.state !== "new") throw new NoVerificable("Esta orden ya no está en «Nuevo». Actualizá el tablero.");
  await odoo.write(MODELO_ORDEN, [ordenId], { state: "running" });
  let aviso: string | null = null;
  try {
    await odoo.messagePost(MODELO_ORDEN, ordenId, conAutor(payloadNotaCambioEstado({ autor, de: "new", a: "running" }), autorPartnerId));
  } catch (e) {
    aviso = `No se pudo publicar la nota de seguimiento: ${e instanceof Error ? e.message : String(e)}`;
  }
  return { chapa: o.vehicle_id ? chapaDe({ license_plate: false, display_name: o.vehicle_id[1] }) : `#${ordenId}`, aviso };
}
