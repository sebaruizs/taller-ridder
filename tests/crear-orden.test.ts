import { describe, expect, it, vi } from "vitest";
import { crearOrden, DatoInvalido, OrdenDuplicada, type DepsNuevaOrden, type EntradaNuevaOrden } from "@/lib/crear-orden";

const VEHICULO = { id: 82, display_name: "Buler/Faiter/230ABPT", license_plate: "230ABPT", driver_id: [2560, "Elias"], state_id: [3, "Alquilado"], odometer: 15000 };

function armar(opts: { enProceso?: unknown[]; sinVehiculo?: boolean; sinTipo?: boolean; fallar?: (method: string, model: string) => boolean } = {}) {
  const llamadas: { method: string; model: string; args: unknown[] }[] = [];
  const reg = (method: string, model: string, ...args: unknown[]) => {
    llamadas.push({ method, model, args });
    if (opts.fallar?.(method, model)) throw new Error("Odoo caído");
  };
  let sig = 500;
  const odoo: DepsNuevaOrden["odoo"] = {
    searchRead: vi.fn(async (model: string, domain: unknown) => {
      reg("searchRead", model, domain);
      if (model === "fleet.vehicle") return opts.sinVehiculo ? [] : [VEHICULO];
      if (model === "fleet.vehicle.log.services") return opts.enProceso ?? [];
      if (model === "fleet.service.type") return opts.sinTipo ? [] : [{ id: 11, name: "Reparación" }];
      return [];
    }) as never,
    create: vi.fn(async (model: string, vals: Record<string, unknown>) => { reg("create", model, vals); return ++sig; }),
    messagePost: vi.fn(async (model: string, id: number, kw: Record<string, unknown>) => { reg("messagePost", model, id, kw); return 1; }),
  };
  const deps: DepsNuevaOrden = {
    odoo,
    telegram: vi.fn(async (chat: string, texto: string) => { reg("telegram", chat, texto); }),
    autor: "Ramón",
    config: { chatTaller: "TALLER", chatErrores: "ERRORES", hoy: "2026-10-24" },
  };
  return { deps, llamadas, escrituras: () => llamadas.filter((l) => l.method !== "searchRead") };
}

const entrada = (e: Partial<EntradaNuevaOrden> = {}): EntradaNuevaOrden => ({
  vehiculoId: 82, tipoId: 11, descripcion: "ruido en el motor", mecanicoPartnerId: 1685, mecanicoNombre: "Carlos", fotos: [], ...e,
});

describe("crear orden", () => {
  it("crea la orden, deja nota de quién la cargó y avisa al taller", async () => {
    const t = armar();
    const r = await crearOrden(entrada(), t.deps);
    expect(r).toEqual({ ordenId: 501, chapa: "230ABPT", avisos: [] });
    expect(t.escrituras().map((l) => `${l.method}:${l.model}`)).toEqual([
      "create:fleet.vehicle.log.services",
      "messagePost:fleet.vehicle.log.services",
      "telegram:TALLER",
    ]);
    expect(t.escrituras()[0].args[0]).toMatchObject({ vehicle_id: 82, state: "new", purchaser_id: 2560, vendor_id: 1685, date: "2026-10-24" });
    expect((t.escrituras()[1].args[1] as { body: string }).body).toContain("Orden cargada por Ramón");
    expect(t.escrituras()[2].args[0]).toContain("🆕 Nueva orden de taller #501");
  });

  it("si la moto ya tiene una orden abierta no crea nada", async () => {
    const t = armar({ enProceso: [{ id: 4132, vehicle_id: [82, "x"], service_type_id: [23, "Mantenimiento"], date: "2026-10-13", state: "cancelled" }] });
    const err = await crearOrden(entrada(), t.deps).catch((e) => e);
    expect(err).toBeInstanceOf(OrdenDuplicada);
    expect(err.existentes).toEqual([{ id: 4132, tipo: "Mantenimiento", fecha: "2026-10-13", estado: "cancelled" }]);
    expect(t.escrituras()).toHaveLength(0);
  });

  it("busca órdenes en proceso filtrando en el dominio de Odoo", async () => {
    const t = armar();
    await crearOrden(entrada(), t.deps);
    const busqueda = t.llamadas.find((l) => l.method === "searchRead" && l.model === "fleet.vehicle.log.services")!;
    expect(busqueda.args[0]).toEqual([["vehicle_id", "in", [82]], ["state", "in", ["new", "running", "cancelled"]]]);
  });

  it("rechaza moto o tipo inexistentes sin escribir", async () => {
    await expect(crearOrden(entrada(), armar({ sinVehiculo: true }).deps)).rejects.toBeInstanceOf(DatoInvalido);
    const t = armar({ sinTipo: true });
    await expect(crearOrden(entrada(), t.deps)).rejects.toBeInstanceOf(DatoInvalido);
    expect(t.escrituras()).toHaveLength(0);
  });

  it("sube las fotos de recepción y las publica en la orden", async () => {
    const t = armar();
    const fotos = [1, 2].map((i) => ({ nombre: `f${i}.jpg`, mimetype: "image/jpeg", datos: Buffer.from(`x${i}`) }));
    await crearOrden(entrada({ fotos }), t.deps);
    expect(t.llamadas.filter((l) => l.model === "ir.attachment")).toHaveLength(2);
    const post = t.llamadas.filter((l) => l.method === "messagePost").at(-1)!;
    expect(post.args[1]).toMatchObject({ attachment_ids: [502, 503], body: "<p>Fotos de recepción</p>" });
  });

  it("si falla la nota después de crear, la orden queda y se avisa al grupo de errores", async () => {
    const t = armar({ fallar: (m) => m === "messagePost" });
    const r = await crearOrden(entrada(), t.deps);
    expect(r.ordenId).toBe(501);
    expect(r.avisos[0]).toContain("nota de seguimiento");
    expect(t.llamadas.some((l) => l.method === "telegram" && l.model === "ERRORES")).toBe(true);
  });
});
