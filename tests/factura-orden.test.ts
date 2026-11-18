import { describe, expect, it, vi } from "vitest";
import { planFactura, seFactura, type Situacion } from "@/lib/factura-orden-dominio";
import { actualizarFactura, type OdooFactura } from "@/lib/factura-orden";

const borrador = (lineas: Situacion["lineas"] = [{ id: 10, productoId: 523, cantidad: 1 }, { id: 11, productoId: 600, cantidad: 2 }]): Situacion => ({
  ventas: 1,
  facturas: [{ id: 126221, nombre: null, estado: "draft" }],
  lineas,
});

describe("seFactura (regla de n8n)", () => {
  it("deja afuera aceite, filtro, relay y gps, sin importar mayúsculas", () => {
    for (const n of ["aceite cvt ipiranga", "Filtro de caja", "Relay GPS - A prueba de agua", "GPS - J16", "Aceite 20w50 - Gulf"]) expect(seFactura(n)).toBe(false);
    for (const n of ["bomba de combustible ", "Junta balancin", "lavado de moto"]) expect(seFactura(n)).toBe(true);
  });
});

describe("planFactura", () => {
  it("agregar: línea nueva al costo unitario de la orden, sin impuestos", () => {
    const p = planFactura({ tipo: "agregar", productoId: 523, producto: "bomba de combustible", cantidad: 1, costoUnitario: 180000 }, borrador([]));
    expect(p).toMatchObject({ accion: "escribir", facturaId: 126221, comandos: [[0, 0, { product_id: 523, quantity: 1, price_unit: 180000, tax_ids: [[6, 0, []]] }]] });
  });

  it("agregar un aceite o un filtro no toca la factura ni avisa", () => {
    expect(planFactura({ tipo: "agregar", productoId: 1, producto: "Aceite 20w50", cantidad: 1, costoUnitario: 180000 }, borrador())).toEqual({ accion: "nada" });
    expect(planFactura({ tipo: "quitar", productoId: 1, producto: "Filtro de aire", cantidad: 1, costoUnitario: 180000 }, borrador())).toEqual({ accion: "nada" });
  });

  it("editar solo el costo lleva el costo nuevo a la factura; sin cambios, nada", () => {
    const p = planFactura({ tipo: "editar", productoId: 523, producto: "bomba", antes: { cantidad: 1, costoUnitario: 150000 }, despues: { cantidad: 1, costoUnitario: 180000 } }, borrador());
    expect(p).toMatchObject({ accion: "escribir", comandos: [[1, 10, { quantity: 1, price_unit: 180000 }]] });
    const igual = { cantidad: 1, costoUnitario: 150000 };
    expect(planFactura({ tipo: "editar", productoId: 523, producto: "bomba", antes: igual, despues: igual }, borrador())).toEqual({ accion: "nada" });
  });

  it("editar la cantidad cambia la línea de ese producto", () => {
    const p = planFactura({ tipo: "editar", productoId: 600, producto: "bujia", antes: { cantidad: 2, costoUnitario: 150000 }, despues: { cantidad: 3, costoUnitario: 180000 } }, borrador());
    expect(p).toMatchObject({ accion: "escribir", comandos: [[1, 11, { quantity: 3, price_unit: 180000 }]] });
  });

  it("quitar borra la línea; si era la última, avisa", () => {
    expect(planFactura({ tipo: "quitar", productoId: 523, producto: "bomba", cantidad: 1, costoUnitario: 180000 }, borrador())).toMatchObject({ accion: "escribir", comandos: [[2, 10, 0]], aviso: undefined });
    const p = planFactura({ tipo: "quitar", productoId: 523, producto: "bomba", cantidad: 1, costoUnitario: 180000 }, borrador([{ id: 10, productoId: 523, cantidad: 1 }]));
    expect(p.accion === "escribir" && p.aviso).toMatch(/sin líneas/);
  });

  it("mismo producto en dos líneas: usa la que tiene la cantidad de antes; si ninguna coincide, no toca", () => {
    const dos = borrador([{ id: 10, productoId: 523, cantidad: 1 }, { id: 12, productoId: 523, cantidad: 4 }]);
    expect(planFactura({ tipo: "editar", productoId: 523, producto: "bomba", antes: { cantidad: 4, costoUnitario: 150000 }, despues: { cantidad: 5, costoUnitario: 180000 } }, dos)).toMatchObject({ comandos: [[1, 12, { quantity: 5, price_unit: 180000 }]] });
    expect(planFactura({ tipo: "quitar", productoId: 523, producto: "bomba", cantidad: 9, costoUnitario: 180000 }, dos)).toMatchObject({ accion: "aviso" });
  });

  it("producto que no está en la factura: avisa y no toca", () => {
    const p = planFactura({ tipo: "editar", productoId: 999, producto: "cubierta", antes: { cantidad: 1, costoUnitario: 150000 }, despues: { cantidad: 2, costoUnitario: 180000 } }, borrador());
    expect(p).toMatchObject({ accion: "aviso" });
  });

  it("orden sin venta (todavía no finalizada): nada", () => {
    expect(planFactura({ tipo: "agregar", productoId: 523, producto: "bomba", cantidad: 1, costoUnitario: 180000 }, { ventas: 0, facturas: [], lineas: [] })).toEqual({ accion: "nada" });
  });

  it("factura confirmada: nunca se toca, avisa con su número", () => {
    const s: Situacion = { ventas: 1, facturas: [{ id: 5, nombre: "INV/2026/00012", estado: "posted" }], lineas: [] };
    for (const c of [
      { tipo: "agregar", productoId: 523, producto: "bomba", cantidad: 1, costoUnitario: 180000 },
      { tipo: "quitar", productoId: 523, producto: "bomba", cantidad: 1, costoUnitario: 180000 },
      { tipo: "editar", productoId: 523, producto: "bomba", antes: { cantidad: 1, costoUnitario: 150000 }, despues: { cantidad: 2, costoUnitario: 180000 } },
    ] as const) {
      const p = planFactura(c, s);
      expect(p.accion).toBe("aviso");
      expect(p.accion === "aviso" && p.aviso).toContain("INV/2026/00012");
    }
  });

  it("sin factura: avisa al agregar, calla al quitar; con varias ventas o borradores no toca", () => {
    const sin: Situacion = { ventas: 1, facturas: [], lineas: [] };
    expect(planFactura({ tipo: "agregar", productoId: 523, producto: "bomba", cantidad: 1, costoUnitario: 180000 }, sin).accion).toBe("aviso");
    expect(planFactura({ tipo: "quitar", productoId: 523, producto: "bomba", cantidad: 1, costoUnitario: 180000 }, sin).accion).toBe("nada");
    expect(planFactura({ tipo: "agregar", productoId: 523, producto: "bomba", cantidad: 1, costoUnitario: 180000 }, { ...sin, ventas: 2 }).accion).toBe("aviso");
    const dos: Situacion = { ...sin, facturas: [{ id: 1, nombre: null, estado: "draft" }, { id: 2, nombre: null, estado: "draft" }] };
    expect(planFactura({ tipo: "agregar", productoId: 523, producto: "bomba", cantidad: 1, costoUnitario: 180000 }, dos).accion).toBe("aviso");
  });
});

function odooFalso(o: { ventas?: unknown[]; movs?: unknown[]; lineas?: unknown[]; fallaWrite?: boolean; fallaNota?: boolean } = {}) {
  const write = vi.fn(async () => {
    if (o.fallaWrite) throw new Error("Odoo caído");
    return true;
  });
  const messagePost = vi.fn(async () => {
    if (o.fallaNota) throw new Error("sin nota");
    return 1;
  });
  const odoo = {
    searchRead: vi.fn(async (model: string) => (model === "sale.order" ? (o.ventas ?? [{ id: 5909, invoice_ids: [126221] }]) : (o.lineas ?? [{ id: 10, product_id: [600, "bujia"], quantity: 2 }]))),
    read: vi.fn(async (model: string) => (model === "account.move" ? (o.movs ?? [{ id: 126221, name: "/", state: "draft", move_type: "out_invoice" }]) : [])),
    write,
    messagePost,
  } as unknown as OdooFactura;
  return { odoo, write, messagePost };
}
const autor = { nombre: "Derlis", odooPartnerId: 77 };

describe("actualizarFactura", () => {
  it("agrega la línea a la factura en borrador y deja una nota en la factura", async () => {
    const f = odooFalso();
    const r = await actualizarFactura(f.odoo, 4495, { tipo: "agregar", productoId: 523, producto: "bomba de combustible", cantidad: 1, costoUnitario: 180000 }, autor);
    expect(r.aviso).toBeNull();
    expect(f.write).toHaveBeenCalledWith("account.move", [126221], { invoice_line_ids: [[0, 0, { product_id: 523, quantity: 1, price_unit: 180000, tax_ids: [[6, 0, []]] }]] });
    expect(f.messagePost).toHaveBeenCalledWith("account.move", 126221, expect.objectContaining({ author_id: 77, body: expect.stringContaining("#4495") }));
  });

  it("no consulta Odoo por un aceite", async () => {
    const f = odooFalso();
    await actualizarFactura(f.odoo, 4495, { tipo: "agregar", productoId: 111, producto: "Aceite 20w50", cantidad: 1, costoUnitario: 180000 }, autor);
    expect(f.odoo.searchRead).not.toHaveBeenCalled();
  });

  it("factura confirmada: no escribe y avisa", async () => {
    const f = odooFalso({ movs: [{ id: 126221, name: "INV/2026/00012", state: "posted", move_type: "out_invoice" }] });
    const r = await actualizarFactura(f.odoo, 4495, { tipo: "editar", productoId: 600, producto: "bujia", antes: { cantidad: 2, costoUnitario: 150000 }, despues: { cantidad: 3, costoUnitario: 180000 } }, autor);
    expect(f.write).not.toHaveBeenCalled();
    expect(r.aviso).toContain("INV/2026/00012");
  });

  it("una factura cancelada o una nota de crédito no cuentan", async () => {
    const f = odooFalso({ movs: [{ id: 1, name: "X", state: "cancel", move_type: "out_invoice" }, { id: 2, name: "RINV", state: "posted", move_type: "out_refund" }, { id: 126221, name: false, state: "draft", move_type: "out_invoice" }] });
    await actualizarFactura(f.odoo, 4495, { tipo: "editar", productoId: 600, producto: "bujia", antes: { cantidad: 2, costoUnitario: 150000 }, despues: { cantidad: 3, costoUnitario: 180000 } }, autor);
    expect(f.write).toHaveBeenCalledWith("account.move", [126221], { invoice_line_ids: [[1, 10, { quantity: 3, price_unit: 180000 }]] });
  });

  it("si Odoo falla al escribir no tira: devuelve un aviso", async () => {
    const f = odooFalso({ fallaWrite: true });
    const r = await actualizarFactura(f.odoo, 4495, { tipo: "quitar", productoId: 600, producto: "bujia", cantidad: 2, costoUnitario: 180000 }, autor);
    expect(r).toEqual({ aviso: expect.stringContaining("no se pudo actualizar la factura"), hecho: null });
  });

  it("si falla la nota, la factura igual quedó actualizada y no hay aviso", async () => {
    const f = odooFalso({ fallaNota: true });
    const r = await actualizarFactura(f.odoo, 4495, { tipo: "editar", productoId: 600, producto: "bujia", antes: { cantidad: 2, costoUnitario: 150000 }, despues: { cantidad: 3, costoUnitario: 180000 } }, autor);
    expect(r.aviso).toBeNull();
    expect(r.hecho).toContain("bujia");
  });

  it("orden sin venta: una sola lectura y nada más", async () => {
    const f = odooFalso({ ventas: [] });
    const r = await actualizarFactura(f.odoo, 4495, { tipo: "agregar", productoId: 523, producto: "bomba", cantidad: 1, costoUnitario: 180000 }, autor);
    expect(r).toEqual({ aviso: null, hecho: null });
    expect(f.odoo.read).not.toHaveBeenCalled();
  });
});
