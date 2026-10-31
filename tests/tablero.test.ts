import { describe, expect, it, vi } from "vitest";
import { eliminarOrden, iniciarOrden, moverOrden, movimientoValido } from "@/lib/tablero";
import { NoVerificable } from "@/lib/verificar";
import { COLUMNAS_TABLERO, dominioOrdenes, payloadNotaCambioEstado } from "@/lib/taller";

function odooCon(estado: string, fallarNota = false) {
  const llamadas: { method: string; args: unknown[] }[] = [];
  return {
    llamadas,
    odoo: {
      read: vi.fn(async () => [{ id: 4366, state: estado, vehicle_id: [9, "Kenton/GTR150 SE/409ABSM"] }]) as never,
      write: vi.fn(async (...args: unknown[]) => { llamadas.push({ method: "write", args }); return true; }),
      messagePost: vi.fn(async (...args: unknown[]) => {
        llamadas.push({ method: "messagePost", args });
        if (fallarNota) throw new Error("caído");
        return 1;
      }),
    },
  };
}

describe("tablero", () => {
  it("tiene exactamente las columnas Nuevo, En proceso, Listo para verificar y Finalizado", () => {
    expect(COLUMNAS_TABLERO).toEqual(["new", "to_be_paid", "running", "cancelled", "done"]);
  });

  it("cada columna filtra por su estado en el dominio de Odoo", () => {
    expect(dominioOrdenes({ estado: "done" })).toEqual([["state", "=", "done"]]);
    expect(dominioOrdenes({ estado: "new", chapa: "409" })).toEqual([["state", "=", "new"], ["vehicle_id.license_plate", "ilike", "409"]]);
  });

  it("pasa de Nuevo a En proceso y deja nota de quién lo hizo", async () => {
    const t = odooCon("new");
    const r = await iniciarOrden(t.odoo, 4366, "Derlis");
    expect(t.llamadas[0]).toEqual({ method: "write", args: ["fleet.vehicle.log.services", [4366], { state: "running" }] });
    expect((t.llamadas[1].args[2] as { body: string }).body).toContain("Derlis</b> pasó la orden de «Nuevo» a «En proceso»");
    expect(r).toEqual({ chapa: "409ABSM", aviso: null });
  });

  it("no mueve órdenes que ya no están en Nuevo", async () => {
    const t = odooCon("running");
    await expect(iniciarOrden(t.odoo, 4366, "Derlis")).rejects.toBeInstanceOf(NoVerificable);
    expect(t.llamadas).toHaveLength(0);
  });

  it("si falla la nota, el cambio de estado queda y se avisa", async () => {
    const t = odooCon("new", true);
    const r = await iniciarOrden(t.odoo, 4366, "Derlis");
    expect(r.aviso).toContain("nota de seguimiento");
  });

  it("la nota escapa el nombre", () => {
    expect(payloadNotaCambioEstado({ autor: "<x>", de: "new", a: "running" }).body).toContain("&lt;x&gt;");
  });
});

describe("filtros de órdenes para Cobranzas", () => {
  it("todas las columnas, por moto, chofer y fechas", () => {
    expect(dominioOrdenes({ estado: "todos", vehiculoId: 66, desde: "2026-10-01", hasta: "2026-10-31" })).toEqual([
      ["vehicle_id", "=", 66],
      ["date", ">=", "2026-10-01"],
      ["date", "<=", "2026-10-31"],
    ]);
    expect(dominioOrdenes({ estado: "done", choferId: 2615 })).toEqual([
      ["state", "=", "done"],
      "|", ["purchaser_id", "=", 2615], "&", ["purchaser_id", "=", false], ["vehicle_id.driver_id", "=", 2615],
    ]);
  });
});

describe("bloquear y desbloquear desde el tablero", () => {
  it("permite Nuevo → En proceso, En proceso ↔ Bloqueado y volver a etapas anteriores, salvo desde Finalizado", () => {
    expect(movimientoValido("running", "to_be_paid")).toBe(true);
    expect(movimientoValido("to_be_paid", "running")).toBe(true);
    expect(movimientoValido("new", "running")).toBe(true);
    expect(movimientoValido("new", "to_be_paid")).toBe(false);
    expect(movimientoValido("running", "done")).toBe(false);
    expect(movimientoValido("cancelled", "done")).toBe(false);
    expect(movimientoValido("running", "cancelled")).toBe(false);
    expect(movimientoValido("cancelled", "running")).toBe(true);
    expect(movimientoValido("cancelled", "to_be_paid")).toBe(true);
    expect(movimientoValido("running", "new")).toBe(true);
    expect(movimientoValido("done", "cancelled")).toBe(false);
  });
});

describe("mover En proceso → Bloqueado", () => {
  it("escribe el estado y deja nota", async () => {
    const t = odooCon("running");
    await moverOrden(t.odoo, 4366, "running", "to_be_paid", "Derlis");
    expect(t.llamadas[0].args).toEqual(["fleet.vehicle.log.services", [4366], { state: "to_be_paid" }]);
    expect(t.llamadas.some((l) => l.method === "messagePost")).toBe(true);
  });
  it("no mueve si la orden ya cambió de estado", async () => {
    const t = odooCon("cancelled");
    await expect(moverOrden(t.odoo, 4366, "running", "to_be_paid", "Derlis")).rejects.toBeInstanceOf(NoVerificable);
    expect(t.llamadas).toHaveLength(0);
  });
});

describe("eliminar orden", () => {
  const odooCon = (estado: string | null) => ({
    read: vi.fn(async () => (estado ? [{ id: 4366, state: estado, vehicle_id: [9, "Kenton/GTR150 SE/409ABSM"], service_type_id: [3, "Service"] }] : [])) as never,
    unlink: vi.fn(async () => true),
  });

  it("borra la orden en Odoo y devuelve qué se borró", async () => {
    const o = odooCon("running");
    expect(await eliminarOrden(o, 4366)).toEqual({ chapa: "409ABSM", estado: "running", tipo: "Service" });
    expect(o.unlink).toHaveBeenCalledWith("fleet.vehicle.log.services", [4366]);
  });

  it("no borra las finalizadas ni las que ya no existen", async () => {
    const fin = odooCon("done");
    await expect(eliminarOrden(fin, 4366)).rejects.toThrow(NoVerificable);
    expect(fin.unlink).not.toHaveBeenCalled();
    await expect(eliminarOrden(odooCon(null), 4366)).rejects.toThrow("no existe");
  });
});
