import { describe, expect, it, vi } from "vitest";
import { crearOdooSimulado, cumpleDominio, type ClienteOdoo } from "@/lib/odoo-simulado";
import { errorDeEntorno } from "@/lib/env";

// "Odoo real" de solo lectura: si la simulación intentara escribir, el test falla.
function odooReal() {
  const ordenes = new Map<number, Record<string, unknown> & { id: number }>([
    [100, { id: 100, state: "running", vendor_id: false, service_end_date: false }],
    [101, { id: 101, state: "running", vendor_id: [7, "Angel"], service_end_date: false }],
  ]);
  const prohibido = async () => {
    throw new Error("escribió en el Odoo real");
  };
  const real: ClienteOdoo = {
    async searchRead<T>(model: string, domain: Parameters<ClienteOdoo["searchRead"]>[1]) {
      if (model !== "fleet.vehicle.log.services") return [] as T[];
      return [...ordenes.values()].filter((o) => cumpleDominio(o, domain)).map((o) => ({ ...o })) as T[];
    },
    async read<T>(model: string, ids: number[]) {
      if (model === "res.partner") return ids.map((id) => ({ id, name: `Contacto real ${id}` })) as T[];
      return ids.map((id) => ordenes.get(id)).filter(Boolean).map((o) => ({ ...o })) as T[];
    },
    readGroup: async <T,>() => [] as T[],
    searchCount: async () => 0,
    write: prohibido,
    create: prohibido,
    boton: prohibido,
    unlink: prohibido,
    messagePost: prohibido,
  };
  return { real, ordenes };
}

describe("Odoo simulado (solo desarrollo)", () => {
  it("no escribe en Odoo y lo deja en el log", async () => {
    const { real, ordenes } = odooReal();
    const log = vi.fn();
    const sim = crearOdooSimulado(real, log);
    await sim.write("fleet.vehicle.log.services", [100], { vendor_id: 5 });
    expect(await sim.create("ir.attachment", { name: "f.jpg", datas: "x".repeat(4000) })).toBeGreaterThan(0);
    expect(await sim.messagePost("fleet.vehicle.log.services", 100, { body: "<p>hola</p>" })).toBeGreaterThan(0);
    expect(ordenes.get(100)!.vendor_id).toBe(false);
    expect(log.mock.calls.map((c) => c[0])).toEqual([
      '[odoo simulado] fleet.vehicle.log.services.write [100] {"vendor_id":5}',
      '[odoo simulado] ir.attachment.create → 900000000 {"name":"f.jpg","datas":"<3 KB>"}',
      '[odoo simulado] fleet.vehicle.log.services.message_post 100 {"body":"<p>hola</p>"}',
    ]);
  });

  it("lo escrito se ve al leer, y las búsquedas lo respetan", async () => {
    const { real } = odooReal();
    const sim = crearOdooSimulado(real, () => {});
    const M = "fleet.vehicle.log.services";
    await sim.write(M, [100], { vendor_id: 5 });
    expect((await sim.read<{ vendor_id: unknown }>(M, [100], ["vendor_id"]))[0].vendor_id).toEqual([5, "Contacto real 5"]);
    // Cerrada en la simulación: ya no aparece entre las en proceso y sí entre las listas para verificar.
    await sim.write(M, [100], { state: "cancelled", service_end_date: "2026-11-17" });
    const ids = async (d: Parameters<ClienteOdoo["searchRead"]>[1]) => (await sim.searchRead<{ id: number }>(M, d, ["id"], { limit: 10 })).map((o) => o.id);
    expect(await ids([["state", "=", "running"]])).toEqual([101]);
    expect(await ids([["state", "=", "cancelled"], ["vendor_id", "=", 5], ["service_end_date", "=", "2026-11-17"]])).toEqual([100]);
    expect(await ids([["state", "=", "running"], "|", ["vendor_id", "=", 5], ["vendor_id", "=", false]])).toEqual([]);
  });

  it("no se puede usar en producción", () => {
    expect(errorDeEntorno({ NODE_ENV: "production", MOVIL_ODOO_SIMULADO: "true" })).toMatch(/no se puede usar en producción/);
    expect(errorDeEntorno({ NODE_ENV: "production", MOVIL_ODOO_SIMULADO: "false" })).toBeNull();
    expect(errorDeEntorno({ NODE_ENV: "development", MOVIL_ODOO_SIMULADO: "true" })).toBeNull();
  });
});
