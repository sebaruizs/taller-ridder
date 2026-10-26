import { describe, expect, it } from "vitest";
import { destinoValido, mensajeTelegramSolicitud, payloadNotaSolicitudAprobada } from "@/lib/solicitudes-dominio";
import { menuDe, pantallasDe, puedeU } from "@/lib/permisos";

describe("solicitudes de trabajo", () => {
  it("solo se reporta sobre una orden abierta de la misma moto, que no esté ya reportada", () => {
    expect(destinoValido({ vehicleId: 59, state: "running" }, 59)).toBeNull();
    expect(destinoValido({ vehicleId: 59, state: "new" }, 59)).toBeNull();
    expect(destinoValido({ vehicleId: 60, state: "running" }, 59)).toBe("Esa orden es de otra moto");
    expect(destinoValido({ vehicleId: 59, state: "cancelled" }, 59)).toMatch(/ya fue reportada/);
    expect(destinoValido(undefined, 59)).toBe("Esa orden no existe en Odoo");
  });

  it("el aviso al grupo dice quién pide, qué moto y que falta aprobar", () => {
    const t = mensajeTelegramSolicitud({ mecanico: "Angel", chapa: "AAUX390", tipo: "Reparación", odometro: 86366, observacion: "Limpieza de sensores", fotos: 4 });
    expect(t).toContain("Solicitud de trabajo de Angel");
    expect(t).toContain("AAUX390");
    expect(t).toContain("86.366 km");
    expect(t).toContain("4 fotos");
    expect(t).toContain("Falta que el jefe de taller la apruebe");
  });

  it("la nota en Odoo deja quién pidió y quién aprobó", () => {
    const n = payloadNotaSolicitudAprobada({ mecanico: "Angel <A>", jefe: "Derlis", solicitudId: 7, ordenNueva: true });
    expect(n.body).toContain("Trabajo solicitado por Angel &lt;A&gt;");
    expect(n.body).toContain("aprobado por <b>Derlis</b>");
    expect(n.body).toContain("solicitud #7");
    expect(n).toMatchObject({ message_type: "comment", body_is_html: true });
  });

  it("el mecánico solicita pero no aprueba; al jefe se le pueden quitar las dos cosas", () => {
    const mecanico = { rol: "mecanico" as const, permisosOff: [] };
    expect(puedeU(mecanico, "solicitudes.crear")).toBe(true);
    expect(puedeU(mecanico, "solicitudes.aprobar")).toBe(false);
    expect(menuDe(pantallasDe(mecanico)).map((p) => p.href)).toEqual(["/ordenes", "/solicitudes"]);
    expect(puedeU({ rol: "jefe", permisosOff: ["aprobar_solicitudes"] }, "solicitudes.aprobar")).toBe(false);
    expect(puedeU({ rol: "mecanico", permisosOff: ["solicitar"] }, "solicitudes.crear")).toBe(false);
  });
});
