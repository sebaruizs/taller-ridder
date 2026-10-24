import { describe, expect, it, vi } from "vitest";
import { cambiarPrecioVenta, payloadNotaPrecio } from "@/lib/cambiar-precio";
import { ProductoInvalido } from "@/lib/crear-producto";

function armar(opts: { precio?: number; noExiste?: boolean; fallarNota?: boolean } = {}) {
  const llamadas: { method: string; args: unknown[] }[] = [];
  const odoo = {
    searchRead: vi.fn(async () => (opts.noExiste ? [] : [{ id: 46, display_name: "Foco H4 - Narva", list_price: opts.precio ?? 20000, product_tmpl_id: [45, "Foco"] }])) as never,
    write: vi.fn(async (...args: unknown[]) => { llamadas.push({ method: "write", args }); return true; }),
    messagePost: vi.fn(async (...args: unknown[]) => {
      llamadas.push({ method: "messagePost", args });
      if (opts.fallarNota) throw new Error("caído");
      return 1;
    }),
  };
  return { odoo, llamadas };
}

describe("cambio de precio de venta", () => {
  it("guarda el precio en Odoo y deja nota en el producto a nombre de quien lo cambió", async () => {
    const t = armar();
    const r = await cambiarPrecioVenta(t.odoo, 46, 25000, { nombre: "Derlis", partnerId: 2179 });
    expect(r).toEqual({ anterior: 20000, nuevo: 25000, cambio: true, aviso: null });
    expect(t.llamadas[0]).toEqual({ method: "write", args: ["product.product", [46], { list_price: 25000 }] });
    const [modelo, tmplId, nota] = t.llamadas[1].args as [string, number, { body: string; author_id: number; body_is_html: boolean }];
    expect(modelo).toBe("product.template");
    expect(tmplId).toBe(45);
    expect(nota.author_id).toBe(2179);
    expect(nota.body_is_html).toBe(true);
    expect(nota.body).toContain("Derlis cambió el precio de venta");
    expect(nota.body).toContain("Gs. 20.000 → <b>Gs. 25.000</b>");
  });

  it("si el precio no cambia no escribe nada", async () => {
    const t = armar({ precio: 25000 });
    const r = await cambiarPrecioVenta(t.odoo, 46, 25000, { nombre: "Derlis", partnerId: null });
    expect(r.cambio).toBe(false);
    expect(t.llamadas).toHaveLength(0);
  });

  it("rechaza productos inexistentes o archivados", async () => {
    await expect(cambiarPrecioVenta(armar({ noExiste: true }).odoo, 46, 1, { nombre: "X", partnerId: null })).rejects.toBeInstanceOf(ProductoInvalido);
  });

  it("si falla la nota, el precio queda cambiado y se avisa", async () => {
    const r = await cambiarPrecioVenta(armar({ fallarNota: true }).odoo, 46, 30000, { nombre: "X", partnerId: null });
    expect(r.cambio).toBe(true);
    expect(r.aviso).toContain("nota de seguimiento");
  });

  it("la nota escapa el nombre del producto", () => {
    expect(payloadNotaPrecio({ autor: "A", producto: "<b>x</b>", anterior: 1, nuevo: 2 }).body).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
