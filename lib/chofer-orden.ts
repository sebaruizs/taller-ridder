// El chofer que corresponde a una orden que no tiene, según el historial de asignaciones de la moto en Odoo.
import type { OdooClient } from "./odoo";
import { MODELO_ASIGNACION, choferEnFecha, type AsignacionChofer } from "./taller";

export async function choferQueCorresponde(odoo: Pick<OdooClient, "searchRead">, vehiculoId: number, fecha: string | false): Promise<number | null> {
  const asignaciones = await odoo.searchRead<AsignacionChofer>(MODELO_ASIGNACION, [["vehicle_id", "=", vehiculoId]], ["driver_id", "date_start"], {
    limit: 500,
    context: { active_test: false },
  });
  return choferEnFecha(asignaciones, fecha);
}
