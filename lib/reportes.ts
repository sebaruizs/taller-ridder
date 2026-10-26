import "server-only";
import { odoo, type Many2one } from "./odoo";
import { MODELO_ORDEN, chapaDe } from "./taller";
import { POR_PAGINA_REPORTES, dominioReportes, leerReporte, type MensajeOrden } from "./reportes-dominio";

type OrdenReporte = {
  id: number;
  vehicle_id: Many2one;
  vendor_id: Many2one;
  odometer: number;
  service_end_date: string | false;
  state: string;
  service_type_id: Many2one;
};

export async function listarReportes(f: { q?: string; mecanicoId?: number; desde?: string; hasta?: string; pagina: number }) {
  const domain = dominioReportes(f);
  const [total, ordenes] = await Promise.all([
    odoo.searchCount(MODELO_ORDEN, domain),
    odoo.searchRead<OrdenReporte>(MODELO_ORDEN, domain, ["id", "vehicle_id", "vendor_id", "odometer", "service_end_date", "state", "service_type_id"], {
      limit: POR_PAGINA_REPORTES,
      offset: (f.pagina - 1) * POR_PAGINA_REPORTES,
      order: "service_end_date desc, id desc",
    }),
  ]);
  const ids = ordenes.map((o) => o.id);
  const mensajes = ids.length
    ? await odoo.searchRead<MensajeOrden & { res_id: number }>(
        "mail.message",
        [["model", "=", MODELO_ORDEN], ["res_id", "in", ids], ["message_type", "=", "comment"]],
        ["id", "res_id", "date", "body", "attachment_ids"],
        { limit: 2000, order: "id desc" },
      )
    : [];
  const porOrden = new Map<number, MensajeOrden[]>();
  for (const m of mensajes) porOrden.set(m.res_id, [...(porOrden.get(m.res_id) ?? []), m]);

  const reportes = ordenes.map((o) => {
    const mecanico = o.vendor_id ? o.vendor_id[1] : null;
    const r = leerReporte(porOrden.get(o.id) ?? [], mecanico);
    return {
      ordenId: o.id,
      fecha: r.fecha,
      dia: o.service_end_date || null,
      mecanico,
      chapa: o.vehicle_id ? chapaDe({ license_plate: false, display_name: o.vehicle_id[1] }) : "—",
      tipo: o.service_type_id ? o.service_type_id[1] : null,
      odometro: o.odometer,
      estado: o.state,
      observacion: r.observacion,
      fotos: r.fotos,
    };
  });
  // Odoo ordena por día; dentro del mismo día, por la hora del reporte.
  reportes.sort((x, y) => (y.dia ?? "").localeCompare(x.dia ?? "") || (y.fecha ?? "").localeCompare(x.fecha ?? ""));
  return { total, pagina: f.pagina, porPagina: POR_PAGINA_REPORTES, reportes };
}

// El reporte (observación, fotos, hora) de una sola orden, para su detalle.
export async function reporteDeOrden(ordenId: number, mecanico: string | null) {
  const mensajes = await odoo.searchRead<MensajeOrden>(
    "mail.message",
    [["model", "=", MODELO_ORDEN], ["res_id", "=", ordenId], ["message_type", "=", "comment"]],
    ["id", "date", "body", "attachment_ids"],
    { limit: 200, order: "id desc" },
  );
  return leerReporte(mensajes, mecanico);
}

export type Reporte = Awaited<ReturnType<typeof listarReportes>>["reportes"][number];

// Foto de una orden de taller. Solo sirve adjuntos de órdenes: nunca otros archivos de Odoo.
export async function fotoDeOrden(id: number): Promise<{ datos: Buffer; mimetype: string } | null> {
  const [a] = await odoo
    .searchRead<{ datas: string | false; mimetype: string | false }>(
      "ir.attachment",
      [["id", "=", id], ["res_model", "=", MODELO_ORDEN], ["mimetype", "=like", "image/%"]],
      ["datas", "mimetype"],
      { limit: 1 },
    )
    .catch(() => []);
  if (!a || !a.datas || !a.mimetype) return null;
  return { datos: Buffer.from(a.datas, "base64"), mimetype: a.mimetype };
}
