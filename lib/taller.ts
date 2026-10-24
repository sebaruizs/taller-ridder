// Reglas del taller y armado de payloads para Odoo. Sin I/O: se testea directo.
import type { Domain, Many2one } from "./odoo";

export const MODELO_ORDEN = "fleet.vehicle.log.services";
export const MODELO_VEHICULO = "fleet.vehicle";

export const ESTADOS = {
  running: "En proceso",
  cancelled: "Listo para verificar",
  to_be_paid: "Listo para entrega",
  done: "Finalizado",
  new: "Nuevo",
} as const;
export type EstadoOrden = keyof typeof ESTADOS;

export const CAMPOS_ORDEN = [
  "id",
  "vehicle_id",
  "service_type_id",
  "description",
  "date",
  "service_end_date",
  "odometer",
  "amount",
  "vendor_id",
  "purchaser_id",
  "state",
  "total_products_cost",
] as const;

export type OrdenOdoo = {
  id: number;
  vehicle_id: Many2one;
  service_type_id: Many2one;
  description: string | false;
  date: string | false;
  service_end_date: string | false;
  odometer: number;
  amount: number;
  vendor_id: Many2one;
  purchaser_id: Many2one;
  state: EstadoOrden;
  total_products_cost: number;
};

export const CAMPOS_VEHICULO = ["id", "display_name", "license_plate", "driver_id", "state_id", "odometer"] as const;

export type VehiculoOdoo = {
  id: number;
  display_name: string;
  license_plate: string | false;
  driver_id: Many2one;
  state_id: Many2one;
  odometer: number;
};

export const TZ = "America/Asuncion";

export function hoyAsuncion(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

export function diasEnTaller(fecha: string | false, ahora = new Date()): number | null {
  if (!fecha) return null;
  const hoy = Date.parse(hoyAsuncion(ahora));
  const inicio = Date.parse(fecha);
  return Math.max(0, Math.round((hoy - inicio) / 86_400_000));
}

export function normalizarChapa(q: string): string {
  return q.replace(/\s+/g, "").toUpperCase();
}

export function dominioOrdenesEnProceso(f: { chapa?: string; tipoId?: number; partnerId?: number | null }): Domain {
  const d: Domain = [["state", "=", "running"]];
  if (f.chapa) d.push(["vehicle_id.license_plate", "ilike", normalizarChapa(f.chapa)]);
  if (f.tipoId) d.push(["service_type_id", "=", f.tipoId]);
  if (f.partnerId !== undefined) d.push(["vendor_id", "=", f.partnerId ?? 0]);
  return d;
}

export function textoOVacio(v: string | false | null | undefined): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s || "—";
}

export function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export type DatosFinalizar = {
  odometro: number;
  partnerMecanico: number | null;
  observacion: string;
  listaEntrega: boolean;
};

// Paso 1: odómetro, mecánico, costo = repuestos, fecha de fin y chofer si faltaba.
export function payloadCamposFinalizar(orden: OrdenOdoo, vehiculo: VehiculoOdoo, datos: DatosFinalizar, hoy: string) {
  const vals: Record<string, unknown> = {
    odometer: datos.odometro,
    amount: orden.total_products_cost || 0,
    service_end_date: hoy,
  };
  if (datos.partnerMecanico) vals.vendor_id = datos.partnerMecanico;
  if (!orden.purchaser_id && vehiculo.driver_id) vals.purchaser_id = vehiculo.driver_id[0];
  return vals;
}

export function payloadFotos(attachmentIds: number[]) {
  return {
    body: "<p>Fotografías del vehículo</p>",
    message_type: "comment",
    subtype_xmlid: "mail.mt_note",
    attachment_ids: attachmentIds,
  };
}

export function payloadObservacion(mecanico: string, observacion: string) {
  return {
    body: `<p><b>${escaparHtml(mecanico)}</b>: ${escaparHtml(observacion).replace(/\r?\n/g, "<br>")}</p>`,
    message_type: "comment",
    subtype_xmlid: "mail.mt_note",
  };
}

export function estadoFinal(listaEntrega: boolean): EstadoOrden {
  return listaEntrega ? "to_be_paid" : "cancelled";
}

// Sin el check la moto queda sin chofer asignado: vuelve al stock "Para entregar".
export function cambioVehiculoAlFinalizar(listaEntrega: boolean, estadoParaEntregar: number) {
  return listaEntrega ? null : { state_id: estadoParaEntregar };
}

export function checkListaEntregaPorDefecto(orden: OrdenOdoo, vehiculo: VehiculoOdoo): boolean {
  return Boolean(orden.purchaser_id || vehiculo.driver_id);
}

export function chapaDe(vehiculo: Pick<VehiculoOdoo, "license_plate" | "display_name">): string {
  if (vehiculo.license_plate) return vehiculo.license_plate;
  return vehiculo.display_name.split("/").pop()?.trim() || vehiculo.display_name;
}

export function mensajeTelegramFinalizado(p: {
  mecanico: string;
  tipo: Many2one;
  chapa: string;
  odometro: number;
  descripcion: string | false;
  observacion: string;
  estado: EstadoOrden;
}): string {
  return [
    `✅ Trabajo finalizado por ${p.mecanico}`,
    `📝 Tarea: ${p.tipo ? p.tipo[1] : "—"}`,
    `🚗 Vehículo: ${p.chapa}`,
    `📏 Odómetro: ${formatoKm(p.odometro)} km`,
    `🔧 Trabajos realizados: ${textoOVacio(p.descripcion)}`,
    `📌 Estado: ${ESTADOS[p.estado]}`,
    "",
    "Comentarios adicionales:",
    textoOVacio(p.observacion),
  ].join("\n");
}

export function mensajeTelegramError(p: { chapa: string; ordenId: number; paso: string; error: string }): string {
  return [`⚠️ Error al escribir en Odoo`, `🚗 Vehículo: ${p.chapa}`, `🧾 Orden: #${p.ordenId}`, `Paso: ${p.paso}`, `Detalle: ${p.error}`].join("\n");
}

export function formatoKm(n: number): string {
  return new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);
}
