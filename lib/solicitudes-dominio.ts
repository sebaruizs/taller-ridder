// Solicitudes de trabajo (sin I/O): textos y reglas.
import { NOTA_INTERNA, escaparHtml } from "./taller";

export const TEXTO_ESTADO_SOLICITUD = { pendiente: "Pendiente", aprobada: "Aprobada", rechazada: "Rechazada" } as const;

export function mensajeTelegramSolicitud(p: { mecanico: string; chapa: string; tipo: string; odometro: number; observacion: string; fotos: number }): string {
  return [
    `📝 Solicitud de trabajo de ${p.mecanico}`,
    `🚗 Vehículo: ${p.chapa}`,
    `🔧 Tarea: ${p.tipo}`,
    `📏 Odómetro: ${new Intl.NumberFormat("es-PY").format(p.odometro)} km`,
    `🗒 ${p.observacion}`,
    p.fotos ? `📷 ${p.fotos} ${p.fotos === 1 ? "foto" : "fotos"}` : "📷 Sin fotos",
    "⏳ Falta que el jefe de taller la apruebe en la app.",
  ].join("\n");
}

export function payloadNotaSolicitudAprobada(p: { mecanico: string; jefe: string; solicitudId: number; ordenNueva: boolean }) {
  return {
    body:
      `<p><b>Trabajo solicitado por ${escaparHtml(p.mecanico)}</b> desde la app del taller (solicitud #${p.solicitudId}) ` +
      `y aprobado por <b>${escaparHtml(p.jefe)}</b>.</p>` +
      (p.ordenNueva ? "<p>La orden se creó al aprobar la solicitud.</p>" : "<p>Se reportó sobre esta orden, que ya existía.</p>"),
    ...NOTA_INTERNA,
  };
}

// Al aprobar se puede usar una orden abierta de la moto, si todavía no fue reportada.
export const ESTADOS_DESTINO = ["new", "running"] as const;

export function destinoValido(orden: { vehicleId: number | null; state: string } | undefined, vehiculoId: number): string | null {
  if (!orden) return "Esa orden no existe en Odoo";
  if (orden.vehicleId !== vehiculoId) return "Esa orden es de otra moto";
  if (!(ESTADOS_DESTINO as readonly string[]).includes(orden.state)) return "Esa orden ya fue reportada: elegí otra o creá una nueva";
  return null;
}
