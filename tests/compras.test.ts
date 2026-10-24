import { describe, expect, it, vi } from "vitest";
import { dominioCompras, origenApp, payloadCompra, payloadNotaCompra, type DatosCompra } from "@/lib/compras-dominio";
import { CompraInvalida, crearCompra, recibirCompra, type OdooCompras } from "@/lib/crear-compra";

const datos = (d: Partial<DatosCompra> = {}): DatosCompra => ({
  clave: "11111111-1111-4111-8111-111111111111",
  proveedorId: 2376,
  referencia: " 001-001-123 ",
  recibir: true,
  lineas: [{ productoId: 111, nombre: "Aceite 20w50", cantidad: 60, precio: 27500 }],
  ...d,
});

// Odoo simulado con estado: la compra pasa por draft → purchase y la recepción por assigned → done.
function armar(opts: { existente?: { state: string; receipt_status: string }; validarNoTermina?: boolean; sinProducto?: boolean } = {}) {
  const llamadas: { method: string; model: string; args: unknown[] }[] = [];
  let compra = opts.existente ? { id: 120, name: "P00120", ...opts.existente, picking_ids: [900] } : null;
  let picking = { id: 900, state: opts.existente?.receipt_status === "full" ? "done" : "assigned" };
  const odoo: OdooCompras = {
    searchRead: vi.fn(async (model: string, domain: unknown) => {
      llamadas.push({ method: "searchRead", model, args: [domain] });
      if (model === "res.partner") return [{ id: 2376 }];
      if (model === "product.product") return opts.sinProducto ? [] : [{ id: 111 }];
      if (model === "purchase.order") return compra ? [{ ...compra }] : [];
      if (model === "stock.picking") {
        const d = JSON.stringify(domain);
        if (d.includes('"not in"')) return picking.state === "done" ? [] : [{ ...picking }];
        return picking.state === "done" ? [] : [{ id: picking.id }];
      }
      return [];
    }) as never,
    create: vi.fn(async (model: string, vals: Record<string, unknown>) => {
      llamadas.push({ method: "create", model, args: [vals] });
      compra = { id: 120, name: "P00120", state: "draft", receipt_status: "pending", picking_ids: [] };
      return 120;
    }),
    boton: vi.fn(async (model: string, method: string, ids: number[]) => {
      llamadas.push({ method, model, args: [ids] });
      if (method === "button_confirm" && compra) compra = { ...compra, state: "purchase", picking_ids: [900] };
      if (method === "button_validate" && !opts.validarNoTermina) {
        picking = { ...picking, state: "done" };
        if (compra) compra = { ...compra, receipt_status: "full" };
      }
      return true;
    }) as never,
    messagePost: vi.fn(async (model: string, id: number, kw: Record<string, unknown>) => { llamadas.push({ method: "messagePost", model, args: [id, kw] }); return 1; }),
  };
  return { odoo, llamadas, botones: () => llamadas.filter((l) => l.method.startsWith("button") || l.method === "action_assign").map((l) => `${l.model}.${l.method}`) };
}

const autor = { nombre: "Derlis", partnerId: 2179 };

describe("compras: reglas", () => {
  it("lista solo compras confirmadas y filtra en el dominio de Odoo", () => {
    expect(dominioCompras({})).toEqual([["state", "in", ["purchase", "done"]]]);
    expect(dominioCompras({ proveedorId: 5, recepcion: "pendientes" })).toEqual([
      ["state", "in", ["purchase", "done"]],
      ["partner_id", "=", 5],
      ["receipt_status", "in", ["pending", "partial"]],
    ]);
  });

  it("arma la compra sin impuestos, con la referencia del proveedor y la marca de la app", () => {
    const v = payloadCompra(datos(), "2026-10-24 20:00:00");
    expect(v).toMatchObject({ partner_id: 2376, partner_ref: "001-001-123", origin: origenApp(datos().clave), date_order: "2026-10-24 20:00:00" });
    expect(v.order_line).toEqual([[0, 0, { product_id: 111, name: "Aceite 20w50", product_qty: 60, price_unit: 27500, taxes_id: [[6, 0, []]], date_planned: "2026-10-24 20:00:00" }]]);
  });

  it("la nota dice quién la cargó, el detalle y si se recibió", () => {
    const b = payloadNotaCompra({ autor: "Derlis", lineas: datos().lineas, recibir: true }).body;
    expect(b).toContain("Compra cargada por Derlis");
    expect(b).toContain("60 × Aceite 20w50 — Gs. 1.650.000");
    expect(b).toContain("Mercadería recibida al cargar");
  });
});

describe("compras: alta en Odoo", () => {
  it("crea, confirma, deja nota y recibe", async () => {
    const t = armar();
    const r = await crearCompra(datos(), t.odoo, autor, "2026-10-24 20:00:00");
    expect(r).toEqual({ compraId: 120, numero: "P00120", recibida: true, avisos: [] });
    expect(t.llamadas.filter((l) => l.method === "create")).toHaveLength(1);
    expect(t.botones()).toEqual(["purchase.order.button_confirm", "stock.picking.button_validate"]);
    const notas = t.llamadas.filter((l) => l.method === "messagePost");
    expect(notas).toHaveLength(2);
    expect(notas[0].args[1]).toMatchObject({ author_id: 2179, body_is_html: true });
  });

  it("sin recibir: queda confirmada y no toca la recepción", async () => {
    const t = armar();
    const r = await crearCompra(datos({ recibir: false }), t.odoo, autor, "x");
    expect(r.recibida).toBe(false);
    expect(t.botones()).toEqual(["purchase.order.button_confirm"]);
  });

  it("si el envío se repite, no crea otra compra y sigue desde donde quedó", async () => {
    const t = armar({ existente: { state: "purchase", receipt_status: "pending" } });
    const r = await crearCompra(datos(), t.odoo, autor, "x");
    expect(t.llamadas.some((l) => l.method === "create")).toBe(false);
    expect(t.botones()).toEqual(["stock.picking.button_validate"]);
    expect(r.recibida).toBe(true);
    expect(t.llamadas.filter((l) => l.method === "messagePost")).toHaveLength(1);
  });

  it("si Odoo no termina la recepción, la compra queda confirmada y se avisa", async () => {
    const t = armar({ validarNoTermina: true });
    const r = await crearCompra(datos(), t.odoo, autor, "x");
    expect(r.recibida).toBe(false);
    expect(r.avisos[0]).toContain("no terminó de validar");
  });

  it("rechaza productos inexistentes sin crear nada", async () => {
    const t = armar({ sinProducto: true });
    await expect(crearCompra(datos(), t.odoo, autor, "x")).rejects.toBeInstanceOf(CompraInvalida);
    expect(t.llamadas.some((l) => l.method === "create")).toBe(false);
  });

  it("recibir una compra ya recibida da error claro", async () => {
    const t = armar({ existente: { state: "purchase", receipt_status: "full" } });
    await expect(recibirCompra(t.odoo, 120, autor)).rejects.toThrow("No hay nada pendiente de recibir");
  });
});
