// Reportes de los mecánicos (sin I/O). Un reporte es una orden ya reportada en Odoo: su nota de
// cierre (del formulario viejo de n8n o de la app) y la nota con las fotos.
import { htmlATexto } from "./historial-formato";
import type { Domain } from "./odoo";

export const POR_PAGINA_REPORTES = 30;
export const ESTADOS_REPORTADOS = ["cancelled", "done"];

export function dominioReportes(f: { q?: string; mecanicoId?: number; desde?: string; hasta?: string }): Domain {
  const d: Domain = [["service_end_date", "!=", false], ["state", "in", ESTADOS_REPORTADOS]];
  const q = f.q?.replace(/\s+/g, "");
  if (q) d.push(["vehicle_id.license_plate", "ilike", q]);
  if (f.mecanicoId) d.push(["vendor_id", "=", f.mecanicoId]);
  if (f.desde) d.push(["service_end_date", ">=", f.desde]);
  if (f.hasta) d.push(["service_end_date", "<=", f.hasta]);
  return d;
}

export type MensajeOrden = { id: number; date: string; body: string | false; attachment_ids: number[] };

const sinEspacios = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();

// Busca en el chatter de una orden la nota del reporte y las fotos. Gana lo más nuevo.
// mecanico: el de la orden, o la lista de nombres de mecánicos (si el jefe corrigió el mecánico, la nota del
// formulario de n8n empieza con el nombre del que reportó, que ya no es el de la orden).
export function leerReporte(mensajes: MensajeOrden[], mecanico: string | null | (string | null)[]) {
  const nombres = (Array.isArray(mecanico) ? mecanico : [mecanico])
    .filter((n): n is string => !!n?.trim())
    .sort((a, b) => b.length - a.length);
  const orden = [...mensajes].sort((a, b) => b.id - a.id);
  let observacion: string | null = null;
  let fecha: string | null = null;
  for (const m of orden) {
    const texto = htmlATexto(m.body);
    // App: "Trabajo finalizado por X (app del taller). … Observación: …"
    if (/^Trabajo finalizado por /.test(texto)) {
      const obs = texto.match(/Observación:\s*([\s\S]*)$/);
      observacion = obs ? obs[1].trim() : "";
      fecha = m.date;
      break;
    }
    // Formulario de n8n: "<Mecánico> <observación>"
    const quien = nombres.find((n) => sinEspacios(texto).startsWith(sinEspacios(n)));
    if (quien) {
      observacion = texto.replace(/\s+/g, " ").trim().slice(quien.replace(/\s+/g, " ").trim().length).trim();
      fecha = m.date;
      break;
    }
  }
  // Fotos del reporte (no las de recepción al crear la orden).
  const conFotos = orden.find((m) => m.attachment_ids.length > 0 && /Fotograf[ií]as del veh[ií]culo/i.test(htmlATexto(m.body)));
  return { observacion, fecha, fotos: conFotos ? [...conFotos.attachment_ids].sort((a, b) => a - b) : [] };
}
