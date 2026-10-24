import { describe, expect, it, vi } from "vitest";
import { ProductoDuplicado, ProductoInvalido, crearProducto, payloadProducto, type DatosProducto, type DepsProducto } from "@/lib/crear-producto";

const PLANTILLA = { taxes_id: [16], supplier_taxes_id: [17], route_ids: [12], purchase_method: "receive", invoice_policy: "order", uom_id: [1, "Units"] as [number, string] };

function armar(opts: { duplicado?: boolean; sinCategoria?: boolean; fallarNota?: boolean } = {}) {
  const llamadas: { method: string; model: string; args: unknown[] }[] = [];
  const odoo: DepsProducto["odoo"] = {
    searchRead: vi.fn(async (model: string, domain: unknown) => {
      llamadas.push({ method: "searchRead", model, args: [domain] });
      if (model === "product.product") return opts.duplicado ? [{ id: 46, display_name: "Foco H4 - Narva", default_code: false }] : [];
      if (model === "product.category") return opts.sinCategoria ? [] : [{ id: 9 }];
      if (model === "res.partner") return [{ id: 2376, name: "Chacomer" }];
      if (model === "product.template") return [PLANTILLA];
      return [];
    }) as never,
    read: vi.fn(async () => [{ product_tmpl_id: [900, "x"] }]) as never,
    create: vi.fn(async (model: string, vals: Record<string, unknown>) => { llamadas.push({ method: "create", model, args: [vals] }); return model === "product.product" ? 901 : 1; }),
    messagePost: vi.fn(async (model: string, id: number, kw: Record<string, unknown>) => {
      llamadas.push({ method: "messagePost", model, args: [id, kw] });
      if (opts.fallarNota) throw new Error("caído");
      return 1;
    }),
  };
  return { deps: { odoo, autor: "Derlis", autorPartnerId: 2179 } as DepsProducto, llamadas };
}

const datos = (d: Partial<DatosProducto> = {}): DatosProducto => ({
  nombre: "  Pastilla de freno - GTR ", categoriaId: 9, codigo: null, costo: 35000, precio: 35000, proveedorId: 2376, ...d,
});

describe("alta de producto", () => {
  it("arma el producto con stock y la configuración del último producto cargado", () => {
    expect(payloadProducto(datos({ codigo: " PF-01 " }), PLANTILLA)).toEqual({
      name: "Pastilla de freno - GTR", categ_id: 9, type: "consu", is_storable: true, sale_ok: true, purchase_ok: true,
      standard_price: 35000, list_price: 35000, default_code: "PF-01",
      taxes_id: [[6, 0, [16]]], supplier_taxes_id: [[6, 0, [17]]], route_ids: [[6, 0, [12]]],
      purchase_method: "receive", invoice_policy: "order", uom_id: 1, uom_po_id: 1,
    });
  });

  it("crea el producto, el proveedor y la nota a nombre de quien lo cargó", async () => {
    const t = armar();
    const r = await crearProducto(datos(), t.deps);
    expect(r).toEqual({ productoId: 901, avisos: [] });
    const creates = t.llamadas.filter((l) => l.method === "create");
    expect(creates.map((c) => c.model)).toEqual(["product.product", "product.supplierinfo"]);
    expect(creates[1].args[0]).toEqual({ product_tmpl_id: 900, partner_id: 2376, price: 35000, min_qty: 1 });
    const nota = t.llamadas.find((l) => l.method === "messagePost")!;
    expect(nota.model).toBe("product.template");
    expect(nota.args[1]).toMatchObject({ author_id: 2179, body_is_html: true });
    expect((nota.args[1] as { body: string }).body).toContain("Producto creado por Derlis");
  });

  it("busca duplicados por nombre exacto (sin mayúsculas) y no crea nada si existe", async () => {
    const t = armar({ duplicado: true });
    await expect(crearProducto(datos({ nombre: "foco h4 - narva" }), t.deps)).rejects.toBeInstanceOf(ProductoDuplicado);
    expect(t.llamadas[0].args[0]).toEqual([["name", "=ilike", "foco h4 - narva"], ["active", "in", [true, false]]]);
    expect(t.llamadas.some((l) => l.method === "create")).toBe(false);
  });

  it("con código, también busca duplicados por código", async () => {
    const t = armar();
    await crearProducto(datos({ codigo: "PF-01" }), t.deps);
    expect(t.llamadas[0].args[0]).toEqual(["|", ["name", "=ilike", "Pastilla de freno - GTR"], ["default_code", "=ilike", "PF-01"], ["active", "in", [true, false]]]);
  });

  it("rechaza una categoría inexistente sin crear nada", async () => {
    const t = armar({ sinCategoria: true });
    await expect(crearProducto(datos(), t.deps)).rejects.toBeInstanceOf(ProductoInvalido);
    expect(t.llamadas.some((l) => l.method === "create")).toBe(false);
  });

  it("si falla la nota, el producto queda creado y se avisa", async () => {
    const t = armar({ fallarNota: true });
    const r = await crearProducto(datos({ proveedorId: null }), t.deps);
    expect(r.productoId).toBe(901);
    expect(r.avisos[0]).toContain("nota de seguimiento");
  });
});
