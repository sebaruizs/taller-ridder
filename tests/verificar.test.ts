import { describe, expect, it, vi } from "vitest";
import { NoVerificable, agregarRepuesto, aprobarOrden, quitarRepuesto, type DepsAprobar, type OdooVerificar } from "@/lib/verificar";
import { mensajeTelegramVerificado, payloadNotaVerificacion } from "@/lib/taller";

type Linea = { id: number; product_id: [number, string]; quantity: number; unit_cost: number; total_cost: number };

function armar(opts: { estado?: string; lineas?: Linea[]; fallar?: (method: string) => boolean } = {}) {
  let lineas = [...(opts.lineas ?? [])];
  let sig = 900;
  const llamadas: { method: string; model: string; args: unknown[] }[] = [];
  const reg = (method: string, model: string, ...args: unknown[]) => {
    llamadas.push({ method, model, args });
    if (opts.fallar?.(method)) throw new Error("Odoo caído");
  };
  const total = () => lineas.reduce((s, l) => s + l.total_cost, 0);
  const odoo: OdooVerificar = {
    read: vi.fn(async (model: string, ids: number[]) => {
      reg("read", model, ids);
      return [{ id: 4132, state: opts.estado ?? "cancelled", vehicle_id: [82, "Kenton/GTR150 LTD/472ABSN"], service_type_id: [23, "Mantenimiento"], total_products_cost: total() }];
    }) as never,
    searchRead: vi.fn(async (model: string, domain: unknown) => {
      reg("searchRead", model, domain);
      if (model === "product.product") return [{ id: 46, display_name: "Foco H4 - Narva" }];
      return lineas;
    }) as never,
    create: vi.fn(async (model: string, vals: Record<string, unknown>) => {
      reg("create", model, vals);
      const q = vals.quantity as number, c = vals.unit_cost as number;
      lineas.push({ id: ++sig, product_id: [vals.product_id as number, "Foco H4 - Narva"], quantity: q, unit_cost: c, total_cost: q * c });
      return sig;
    }),
    write: vi.fn(async (model: string, ids: number[], vals: Record<string, unknown>) => { reg("write", model, ids, vals); return true; }),
    unlink: vi.fn(async (model: string, ids: number[]) => { reg("unlink", model, ids); lineas = lineas.filter((l) => !ids.includes(l.id)); return true; }),
    messagePost: vi.fn(async (model: string, id: number, kw: Record<string, unknown>) => { reg("messagePost", model, id, kw); return 1; }),
  };
  const deps: DepsAprobar = {
    odoo,
    telegram: vi.fn(async (chat: string, texto: string) => { reg("telegram", chat, texto); }),
    autor: "Derlis",
    config: { chatTaller: "TALLER", chatErrores: "ERRORES" },
  };
  return { odoo, deps, llamadas };
}

const foco: Linea = { id: 1, product_id: [46, "Foco H4 - Narva"], quantity: 2, unit_cost: 20000, total_cost: 40000 };

describe("repuestos de una orden para verificar", () => {
  it("agrega la línea sin tocar stock y actualiza el costo de la orden", async () => {
    const t = armar();
    const r = await agregarRepuesto(t.odoo, 4132, { productoId: 46, cantidad: 2, costoUnitario: 20000 });
    const create = t.llamadas.find((l) => l.method === "create")!;
    expect(create.model).toBe("fleet.vehicle.log.services.product.line");
    expect(create.args[0]).toEqual({ service_id: 4132, product_id: 46, quantity: 2, unit_cost: 20000 });
    expect(create.args[0]).not.toHaveProperty("delivered");
    expect(t.llamadas.find((l) => l.method === "write")!.args[1]).toEqual({ amount: 40000 });
    expect(r.lineas).toHaveLength(1);
  });

  it("no deja cargar repuestos si la orden ya no está para verificar", async () => {
    const t = armar({ estado: "done" });
    await expect(agregarRepuesto(t.odoo, 4132, { productoId: 46, cantidad: 1, costoUnitario: 1 })).rejects.toBeInstanceOf(NoVerificable);
    expect(t.llamadas.some((l) => l.method === "create")).toBe(false);
  });

  it("solo quita líneas de esa misma orden", async () => {
    const t = armar({ lineas: [foco] });
    await expect(quitarRepuesto(t.odoo, 4132, 999)).rejects.toBeInstanceOf(NoVerificable);
    const r = await quitarRepuesto(t.odoo, 4132, 1);
    expect(r.lineas).toHaveLength(0);
    expect(t.llamadas.find((l) => l.method === "write")!.args[1]).toEqual({ amount: 0 });
  });
});

describe("aprobar", () => {
  it("pasa a Finalizado con el costo de repuestos, deja nota y avisa", async () => {
    const t = armar({ lineas: [foco] });
    const r = await aprobarOrden(t.deps, 4132, false);
    const write = t.llamadas.find((l) => l.method === "write")!;
    expect(write.args[1]).toEqual({ amount: 40000, state: "done" });
    const nota = t.llamadas.find((l) => l.method === "messagePost")!.args[1] as { body: string };
    expect(nota.body).toContain("Verificado por Derlis");
    expect(nota.body).toContain("2 × Foco H4 - Narva — Gs. 40.000");
    expect(t.llamadas.some((l) => l.method === "telegram" && l.model === "TALLER")).toBe(true);
    expect(r).toMatchObject({ chapa: "472ABSN", avisos: [] });
  });

  it("sin repuestos exige confirmación explícita", async () => {
    const t = armar();
    await expect(aprobarOrden(t.deps, 4132, false)).rejects.toBeInstanceOf(NoVerificable);
    expect(t.llamadas.some((l) => l.method === "write")).toBe(false);
    await aprobarOrden(t.deps, 4132, true);
    expect(t.llamadas.find((l) => l.method === "write")!.args[1]).toEqual({ amount: 0, state: "done" });
  });

  it("si falla la nota, el cambio de estado queda y se avisa al grupo de errores", async () => {
    const t = armar({ lineas: [foco], fallar: (m) => m === "messagePost" });
    const r = await aprobarOrden(t.deps, 4132, false);
    expect(r.avisos[0]).toContain("nota de seguimiento");
    expect(t.llamadas.some((l) => l.method === "telegram" && l.model === "ERRORES")).toBe(true);
  });
});

describe("textos de verificación", () => {
  it("la nota sin repuestos lo dice explícitamente", () => {
    expect(payloadNotaVerificacion({ autor: "Derlis", lineas: [] }).body).toContain("Sin repuestos");
  });

  it("el Telegram lista repuestos y total", () => {
    const m = mensajeTelegramVerificado({
      autor: "Derlis", chapa: "472ABSN", tipo: "Mantenimiento",
      lineas: [{ id: 1, producto: "Foco H4", productoId: 46, cantidad: 1.5, costoUnitario: 10000, total: 15000 }],
    });
    expect(m).toContain("🔎 Verificado por Derlis");
    expect(m).toContain("• 1,5 × Foco H4");
    expect(m).toContain("Total repuestos: Gs. 15.000");
  });
});
