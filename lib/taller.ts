// Reglas del taller y armado de payloads para Odoo. Sin I/O: se testea directo.
import type { Domain, Many2one } from "./odoo";

export const MODELO_ORDEN = "fleet.vehicle.log.services";
export const MODELO_VEHICULO = "fleet.vehicle";

export const ESTADOS = {
  running: "En proceso",
  cancelled: "Listo para verificar",
  to_be_paid: "Bloqueado", // en Odoo todavía se llama «Listo para entrega»
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

// Nota interna del chatter. body_is_html: sin esto Odoo 17+ guarda las etiquetas como texto ("<p>…</p>" literal).
export const NOTA_INTERNA = { message_type: "comment", subtype_xmlid: "mail.mt_note", body_is_html: true } as const;

// La nota figura a nombre del contacto de Odoo de quien hizo la acción, no del usuario de la API.
export function conAutor<T extends Record<string, unknown>>(payload: T, partnerId: number | null | undefined): T & { author_id?: number } {
  return partnerId ? { ...payload, author_id: partnerId } : payload;
}

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

export function dominioOrdenes(f: { estado?: EstadoOrden; chapa?: string; tipoId?: number; partnerId?: number | null }): Domain {
  const d: Domain = [["state", "=", f.estado ?? "running"]];
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
};

// Paso 1: odómetro, costo = repuestos, fecha de fin; mecánico y chofer solo si faltaban.
export function payloadCamposFinalizar(orden: OrdenOdoo, vehiculo: VehiculoOdoo, datos: DatosFinalizar, hoy: string) {
  const vals: Record<string, unknown> = {
    odometer: datos.odometro,
    amount: orden.total_products_cost || 0,
    service_end_date: hoy,
  };
  if (!orden.vendor_id && datos.partnerMecanico) vals.vendor_id = datos.partnerMecanico;
  if (!orden.purchaser_id && vehiculo.driver_id) vals.purchaser_id = vehiculo.driver_id[0];
  return vals;
}

export function payloadFotos(attachmentIds: number[], titulo = "Fotografías del vehículo") {
  return {
    body: `<p>${escaparHtml(titulo)}</p>`,
    ...NOTA_INTERNA,
    attachment_ids: attachmentIds,
  };
}

const parrafos = (s: string) => escaparHtml(s).replace(/\r?\n/g, "<br>");

// Siempre se publica, haya o no observación: deja en Odoo quién finalizó y cómo.
export function payloadNotaFinalizacion(p: { mecanico: string; observacion: string; odometro: number; estado: EstadoOrden }) {
  const obs = p.observacion.trim();
  return {
    body:
      `<p><b>Trabajo finalizado por ${escaparHtml(p.mecanico)}</b> (app del taller).</p>` +
      `<p>Odómetro: ${formatoKm(p.odometro)} km · Nuevo estado: ${ESTADOS[p.estado]}</p>` +
      (obs ? `<p>Observación: ${parrafos(obs)}</p>` : ""),
    ...NOTA_INTERNA,
  };
}

// ---------- tablero ----------

export const COLUMNAS_TABLERO = ["new", "to_be_paid", "running", "cancelled", "done"] as const satisfies readonly EstadoOrden[];

export function payloadNotaCambioEstado(p: { autor: string; de: EstadoOrden; a: EstadoOrden }) {
  return {
    body: `<p><b>${escaparHtml(p.autor)}</b> pasó la orden de «${ESTADOS[p.de]}» a «${ESTADOS[p.a]}» (app del taller).</p>`,
    ...NOTA_INTERNA,
  };
}

// ---------- verificación y repuestos (jefe de taller) ----------

export const MODELO_LINEA = "fleet.vehicle.log.services.product.line";

export type LineaRepuesto = { id: number; producto: string; productoId: number; cantidad: number; costoUnitario: number; total: number };

// No se toca "delivered": esas líneas no mueven stock hoy y así deben seguir.
export function payloadLineaRepuesto(ordenId: number, p: { productoId: number; cantidad: number; costoUnitario: number }) {
  return { service_id: ordenId, product_id: p.productoId, quantity: p.cantidad, unit_cost: p.costoUnitario };
}

export function formatoGs(n: number): string {
  return `Gs. ${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Math.round(n))}`;
}

export function totalRepuestos(lineas: Pick<LineaRepuesto, "total">[]): number {
  return lineas.reduce((s, l) => s + (l.total || 0), 0);
}

function cantidadTexto(n: number): string {
  return Number.isInteger(n) ? String(n) : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(n);
}

export function payloadNotaVerificacion(p: { autor: string; lineas: LineaRepuesto[] }) {
  const total = totalRepuestos(p.lineas);
  const detalle = p.lineas.length
    ? `<ul>${p.lineas
        .map((l) => `<li>${cantidadTexto(l.cantidad)} × ${escaparHtml(l.producto)} — ${formatoGs(l.total)}</li>`)
        .join("")}</ul><p>Total repuestos: <b>${formatoGs(total)}</b></p>`
    : "<p>Sin repuestos.</p>";
  return {
    body: `<p><b>Verificado por ${escaparHtml(p.autor)}</b> (app del taller). Nuevo estado: ${ESTADOS[ESTADO_AL_APROBAR]}.</p>${detalle}`,
    ...NOTA_INTERNA,
  };
}

export function mensajeTelegramVerificado(p: { autor: string; chapa: string; tipo: string | null; lineas: LineaRepuesto[] }): string {
  const lineas = p.lineas.length
    ? p.lineas.map((l) => `• ${cantidadTexto(l.cantidad)} × ${l.producto}`).join("\n")
    : "• Sin repuestos";
  return [
    `🔎 Verificado por ${p.autor}`,
    `🚗 Vehículo: ${p.chapa}`,
    `📝 Tarea: ${p.tipo ?? "—"}`,
    `📌 Estado: ${ESTADOS[ESTADO_AL_APROBAR]}`,
    "",
    "Repuestos:",
    lineas,
    `💰 Total repuestos: ${formatoGs(totalRepuestos(p.lineas))}`,
  ].join("\n");
}

// ---------- nueva orden (jefe de taller) ----------

export type DatosNuevaOrden = {
  tipoId: number;
  descripcion: string;
  mecanicoPartnerId: number | null;
};

export function payloadNuevaOrden(vehiculo: VehiculoOdoo, datos: DatosNuevaOrden, hoy: string) {
  const vals: Record<string, unknown> = {
    vehicle_id: vehiculo.id,
    service_type_id: datos.tipoId,
    description: datos.descripcion.trim(),
    date: hoy,
    state: "new",
  };
  if (vehiculo.driver_id) vals.purchaser_id = vehiculo.driver_id[0];
  if (datos.mecanicoPartnerId) vals.vendor_id = datos.mecanicoPartnerId;
  return vals;
}

export function payloadNotaNuevaOrden(p: { autor: string; mecanico: string | null; fotos: number }) {
  return {
    body:
      `<p><b>Orden cargada por ${escaparHtml(p.autor)}</b> (app del taller).</p>` +
      `<p>Mecánico asignado: ${escaparHtml(p.mecanico ?? "sin asignar")}` +
      (p.fotos ? ` · Fotos de recepción: ${p.fotos}` : "") +
      `</p>`,
    ...NOTA_INTERNA,
  };
}

export function mensajeTelegramNuevaOrden(p: {
  autor: string;
  chapa: string;
  tipo: string;
  descripcion: string;
  mecanico: string | null;
  chofer: string | null;
  ordenId: number;
}): string {
  return [
    `🆕 Nueva orden de taller #${p.ordenId}`,
    `🚗 Vehículo: ${p.chapa}`,
    `📝 Tarea: ${p.tipo}`,
    `🔧 Pedido: ${textoOVacio(p.descripcion)}`,
    `👨‍🔧 Mecánico: ${p.mecanico ?? "Sin asignar"}`,
    `👤 Chofer: ${p.chofer ?? "—"}`,
    `🧾 Cargada por ${p.autor}`,
  ].join("\n");
}

// El mecánico reporta y la orden queda para que el jefe cargue los repuestos.
export const ESTADO_AL_REPORTAR: EstadoOrden = "cancelled";
// El jefe carga los repuestos y aprueba: la orden queda cerrada.
export const ESTADO_AL_APROBAR: EstadoOrden = "done";

// Sin el check la moto queda sin chofer asignado: vuelve al stock "Para entregar".
// Moto sin chofer: al reportar vuelve al stock "Para entregar" (regla heredada de n8n).
export function cambioVehiculoAlFinalizar(tieneChofer: boolean, estadoParaEntregar: number) {
  return tieneChofer ? null : { state_id: estadoParaEntregar };
}

export function tieneChofer(orden: Pick<OrdenOdoo, "purchaser_id">, vehiculo: Pick<VehiculoOdoo, "driver_id">): boolean {
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
