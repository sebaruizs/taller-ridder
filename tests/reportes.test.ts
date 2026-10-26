import { describe, expect, it } from "vitest";
import { dominioReportes, leerReporte } from "@/lib/reportes-dominio";
import { inicioDe, pantallasDe, puedeU } from "@/lib/permisos";

describe("reportes de mecánicos", () => {
  it("lista órdenes reportadas, filtrando por chapa, mecánico y fechas en Odoo", () => {
    expect(dominioReportes({ q: " 817 abti ", mecanicoId: 2006, desde: "2026-10-01", hasta: "2026-10-26" })).toEqual([
      ["service_end_date", "!=", false],
      ["state", "in", ["cancelled", "to_be_paid", "done"]],
      ["vehicle_id.license_plate", "ilike", "817abti"],
      ["vendor_id", "=", 2006],
      ["service_end_date", ">=", "2026-10-01"],
      ["service_end_date", "<=", "2026-10-26"],
    ]);
  });

  it("lee el reporte del formulario de n8n: nombre del mecánico y observación", () => {
    const r = leerReporte(
      [
        { id: 1, date: "2026-10-26 11:16:49", body: "<p>Servicios para los vehículos creado</p>", attachment_ids: [] },
        { id: 3, date: "2026-10-26 12:57:54", body: "<p>Diego Armando Samudio Ayala Cambio de Zapata trasera Cambio de reten </p>", attachment_ids: [] },
        { id: 4, date: "2026-10-26 12:58:25", body: "<p>&lt;p&gt;Fotografías del vehículo&lt;/p&gt;</p>", attachment_ids: [14262, 14259, 14261, 14260] },
      ],
      "Diego Armando Samudio Ayala",
    );
    expect(r).toEqual({ observacion: "Cambio de Zapata trasera Cambio de reten", fecha: "2026-10-26 12:57:54", fotos: [14259, 14260, 14261, 14262] });
  });

  it("lee el reporte de la app y no toma las fotos de recepción", () => {
    const r = leerReporte(
      [
        { id: 1, date: "2026-10-24 19:23:57", body: "<p>Fotos de recepción</p>", attachment_ids: [9, 10] },
        { id: 2, date: "2026-10-24 19:25:10", body: "<p>Fotografías del vehículo</p>", attachment_ids: [11] },
        { id: 3, date: "2026-10-24 19:25:11", body: "<p><b>Trabajo finalizado por Admin</b> (app del taller).</p><p>Odómetro: 15.110 km</p><p>Observación: Cambio de aceite<br>Frenos</p>", attachment_ids: [] },
      ],
      "Carlos",
    );
    expect(r).toEqual({ observacion: "Cambio de aceite\nFrenos", fecha: "2026-10-24 19:25:11", fotos: [11] });
  });

  it("sin nota de reporte queda en null (orden cerrada a mano en Odoo)", () => {
    expect(leerReporte([], "Angel").observacion).toBeNull();
  });

  it("los ve el jefe (se le puede quitar), no el mecánico", () => {
    expect(puedeU({ rol: "mecanico", permisosOff: [] }, "reportes.ver")).toBe(false);
    expect(puedeU({ rol: "jefe", permisosOff: ["reportes"] }, "reportes.ver")).toBe(false);
    expect(pantallasDe({ rol: "jefe", permisosOff: [] }).map((p) => p.href)).toContain("/reportes");
    expect(inicioDe({ rol: "jefe", permisosOff: ["ver_ordenes", "tablero", "repuestos", "aprobar", "crear"] })).toBe("/reportes");
  });
});
