import { beforeEach, describe, expect, it, vi } from "vitest";
import { ejecutarFinalizacion, FinalizarError, type Deps, type EstadoFinalizacion, type FotoPendiente } from "@/lib/finalizar";

const ORDEN = {
  id: 4358,
  vehicle_id: [82, "Buler/Faiter/230ABPT"],
  service_type_id: [23, "Mantenimiento"],
  description: false,
  state: "running",
  purchaser_id: [2560, "Elias"],
  total_products_cost: 160000,
};
const VEHICULO = { id: 82, display_name: "Buler/Faiter/230ABPT", license_plate: "230ABPT", driver_id: [2560, "Elias"], state_id: [2, "En taller"], odometer: 15000 };

function armar(opts: { fotos?: number; estadoOrden?: string; vendor?: [number, string]; sinChofer?: boolean; fallar?: (method: string, model: string, args: unknown[]) => boolean } = {}) {
  let estado: EstadoFinalizacion = {
    id: 1, ordenId: 4358, odometro: 15230, observacion: "cambié cadena",
    camposOk: false, fotosOk: false, attachmentIds: [], notaOk: false, estadoOk: false, telegramOk: false,
  };
  let fotos: FotoPendiente[] = Array.from({ length: opts.fotos ?? 0 }, (_, i) => ({
    id: i + 1, nombre: `f${i}.jpg`, mimetype: "image/jpeg", datos: Buffer.from(`foto${i}`), attachmentId: null,
  }));
  const llamadas: { method: string; model: string; args: unknown[] }[] = [];
  let sigAtt = 900;
  const registrar = (method: string, model: string, ...args: unknown[]) => {
    llamadas.push({ method, model, args });
    if (opts.fallar?.(method, model, args)) throw new Error("Odoo caído");
  };
  const odoo: Deps["odoo"] = {
    read: vi.fn(async (model: string, ids: number[]) => { registrar("read", model, ids); return [{ ...ORDEN, state: opts.estadoOrden ?? "running", vendor_id: opts.vendor ?? false, ...(opts.sinChofer ? { purchaser_id: false } : {}) }]; }) as never,
    searchRead: vi.fn(async (model: string) => { registrar("searchRead", model); return [opts.sinChofer ? { ...VEHICULO, driver_id: false } : VEHICULO]; }) as never,
    write: vi.fn(async (model: string, ids: number[], vals: Record<string, unknown>) => { registrar("write", model, ids, vals); return true; }),
    create: vi.fn(async (model: string, vals: Record<string, unknown>) => { registrar("create", model, vals); return ++sigAtt; }),
    messagePost: vi.fn(async (model: string, id: number, kw: Record<string, unknown>) => { registrar("messagePost", model, id, kw); return 1; }),
  };
  const telegram = vi.fn(async (chat: string, texto: string) => { registrar("telegram", chat, texto); if (opts.fallar?.("telegram", chat, [texto])) throw new Error("tg"); });
  const deps: Deps = {
    odoo,
    telegram,
    mecanico: { nombre: "Juan", partnerId: 77 },
    config: { estadoParaEntregar: 1, chatTaller: "TALLER", chatErrores: "ERRORES", hoy: "2026-10-24" },
    store: {
      async guardar(p) { estado = { ...estado, ...p }; },
      async fotos() { return fotos.map((f) => ({ ...f })); },
      async marcarFoto(id, att) { fotos = fotos.map((f) => (f.id === id ? { ...f, attachmentId: att } : f)); },
      async borrarFotos() { fotos = []; },
    },
  };
  return { deps, llamadas, get estado() { return estado; }, escrituras: () => llamadas.filter((l) => !["read", "searchRead"].includes(l.method)) };
}

describe("finalizar", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("hace los pasos en orden: campos, fotos, nota, estado, Telegram", async () => {
    const t = armar({ fotos: 2 });
    const r = await ejecutarFinalizacion(t.estado, t.deps);
    expect(t.escrituras().map((l) => `${l.method}:${l.model}`)).toEqual([
      "write:fleet.vehicle.log.services",
      "create:ir.attachment",
      "create:ir.attachment",
      "messagePost:fleet.vehicle.log.services",
      "messagePost:fleet.vehicle.log.services",
      "write:fleet.vehicle.log.services",
      "telegram:TALLER",
    ]);
    expect(t.escrituras()[0].args[1]).toEqual({ odometer: 15230, amount: 160000, service_end_date: "2026-10-24", vendor_id: 77 });
    expect(t.escrituras()[3].args[1]).toMatchObject({ attachment_ids: [901, 902], subtype_xmlid: "mail.mt_note" });
    expect(t.escrituras()[5].args[1]).toEqual({ state: "cancelled" });
    expect(r).toMatchObject({ chapa: "230ABPT", fotos: 2, estado: "cancelled", avisoTelegram: true });
  });

  it("si la orden ya tiene mecánico asignado, no lo reemplaza por el que reporta", async () => {
    const t = armar({ vendor: [2068, "Kevin"] });
    await ejecutarFinalizacion(t.estado, t.deps);
    expect(t.escrituras()[0].args[1]).not.toHaveProperty("vendor_id");
    const nota = t.llamadas.find((l) => l.method === "messagePost")!.args[1] as { body: string };
    expect(nota.body).toContain("Trabajo finalizado por Juan");
  });

  it("sin fotos no crea adjuntos ni falla", async () => {
    const t = armar({ fotos: 0 });
    const r = await ejecutarFinalizacion(t.estado, t.deps);
    expect(t.llamadas.some((l) => l.model === "ir.attachment")).toBe(false);
    expect(t.llamadas.filter((l) => l.method === "messagePost")).toHaveLength(1);
    expect(r.fotos).toBe(0);
  });

  it("sin observación igual deja la nota de seguimiento con mecánico, km y estado", async () => {
    const t = armar();
    const r = await ejecutarFinalizacion({ ...t.estado, observacion: "  " }, t.deps);
    const notas = t.llamadas.filter((l) => l.method === "messagePost");
    expect(notas).toHaveLength(1);
    const body = (notas[0].args[1] as { body: string }).body;
    expect(body).toContain("Trabajo finalizado por Juan");
    expect(body).toContain("15.230 km");
    expect(body).not.toContain("Observación");
    expect(r.estado).toBe("cancelled");
  });

  it("moto sin chofer: pasa a Listo para verificar y el vehículo a Para entregar", async () => {
    const t = armar({ sinChofer: true });
    await ejecutarFinalizacion(t.estado, t.deps);
    const w = t.escrituras().filter((l) => l.method === "write");
    expect(w[1]).toMatchObject({ model: "fleet.vehicle.log.services", args: [[4358], { state: "cancelled" }] });
    expect(w[2]).toMatchObject({ model: "fleet.vehicle", args: [[82], { state_id: 1 }] });
  });

  it("moto con chofer: pasa a Listo para verificar sin tocar el vehículo", async () => {
    const t = armar();
    await ejecutarFinalizacion(t.estado, t.deps);
    expect(t.escrituras().some((l) => l.model === "fleet.vehicle")).toBe(false);
  });

  it("si falla a la mitad, el reintento no duplica fotos ni campos", async () => {
    let fallarEstado = true;
    const t = armar({ fotos: 2, fallar: (m, model, args) => fallarEstado && m === "write" && (args[1] as Record<string, unknown>)?.state !== undefined && model === "fleet.vehicle.log.services" });
    await expect(ejecutarFinalizacion(t.estado, t.deps)).rejects.toMatchObject({ paso: "estado" });
    expect(t.estado).toMatchObject({ camposOk: true, fotosOk: true, notaOk: true, estadoOk: false });
    expect(t.llamadas.some((l) => l.method === "telegram" && l.model === "ERRORES")).toBe(true);

    fallarEstado = false;
    const antes = t.escrituras().length;
    await ejecutarFinalizacion(t.estado, t.deps);
    const nuevas = t.escrituras().slice(antes).map((l) => `${l.method}:${l.model}`);
    expect(nuevas).toEqual(["write:fleet.vehicle.log.services", "telegram:TALLER"]);
    expect(t.llamadas.filter((l) => l.model === "ir.attachment")).toHaveLength(2);
  });

  it("si falla publicar las fotos, reusa los adjuntos ya subidos", async () => {
    let fallar = true;
    const t = armar({ fotos: 2, fallar: (m, model, args) => fallar && m === "messagePost" && Boolean((args[1] as Record<string, unknown>)?.attachment_ids) });
    await expect(ejecutarFinalizacion(t.estado, t.deps)).rejects.toBeInstanceOf(FinalizarError);
    fallar = false;
    await ejecutarFinalizacion(t.estado, t.deps);
    expect(t.llamadas.filter((l) => l.model === "ir.attachment")).toHaveLength(2);
    expect(t.estado.attachmentIds).toEqual([901, 902]);
  });

  it("Telegram caído no invalida el trabajo", async () => {
    const t = armar({ fallar: (m) => m === "telegram" });
    const r = await ejecutarFinalizacion(t.estado, t.deps);
    expect(r.avisoTelegram).toBe(false);
    expect(t.estado.estadoOk).toBe(true);
  });

  it("rechaza una orden que ya no está en proceso sin escribir nada", async () => {
    const t = armar({ estadoOrden: "to_be_paid" });
    await expect(ejecutarFinalizacion(t.estado, t.deps)).rejects.toMatchObject({ paso: "validacion" });
    expect(t.escrituras()).toHaveLength(0);
  });

  it("descripción vacía en Odoo sale como — en Telegram", async () => {
    const t = armar();
    await ejecutarFinalizacion(t.estado, t.deps);
    const msg = t.llamadas.find((l) => l.method === "telegram")!.args[0] as string;
    expect(msg).toContain("Trabajos realizados: —");
    expect(msg).not.toContain("false");
  });
});
