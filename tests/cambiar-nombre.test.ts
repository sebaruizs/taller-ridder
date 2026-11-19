import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { cambiarNombreProducto, esquemaNombre, payloadNotaNombre } from "@/lib/cambiar-nombre";
import { ProductoDuplicado, ProductoInvalido } from "@/lib/crear-producto";

function armar(opts: { nombre?: string; noExiste?: boolean; duplicado?: boolean; fallarNota?: boolean; odooGuarda?: string; variantes?: number[] } = {}) {
  const llamadas: { method: string; args: unknown[] }[] = [];
  const odoo = {
    searchRead: vi.fn(async (_m: string, dominio: unknown[]) => {
      llamadas.push({ method: "searchRead", args: [dominio] });
      const esDuplicados = JSON.stringify(dominio).includes("=ilike");
      if (esDuplicados) return opts.duplicado ? [{ id: 99, display_name: "Foco H4", default_code: false }] : [];
      if (JSON.stringify(dominio).includes('"product_tmpl_id","="')) return [{ id: 46 }, ...(opts.variantes ?? []).map((id) => ({ id }))];
      return opts.noExiste ? [] : [{ id: 46, name: opts.nombre ?? "Foco H4 - Narva", product_tmpl_id: [45, "Foco"] }];
    }) as never,
    read: vi.fn(async () => [{ name: opts.odooGuarda ?? "__igual__" }]) as never,
    write: vi.fn(async (...args: unknown[]) => { llamadas.push({ method: "write", args }); return true; }),
    messagePost: vi.fn(async (...args: unknown[]) => {
      llamadas.push({ method: "messagePost", args });
      if (opts.fallarNota) throw new Error("caído");
      return 1;
    }),
  };
  return { odoo, llamadas };
}
// Por defecto Odoo devuelve lo mismo que se le escribió.
function conEco(t: ReturnType<typeof armar>) {
  t.odoo.read = vi.fn(async () => {
    const w = t.llamadas.find((l) => l.method === "write");
    return [{ name: (w?.args[2] as { name: string }).name }];
  }) as never;
  return t;
}
const autor = { nombre: "Derlis", partnerId: 2179 };

describe("cambio de nombre de un producto", () => {
  it("escribe el nombre en la plantilla y deja nota a nombre de quien lo cambió", async () => {
    const t = conEco(armar());
    const r = await cambiarNombreProducto(t.odoo, 46, "Foco H4 Narva 12V", autor);
    expect(r).toEqual({ anterior: "Foco H4 - Narva", nuevo: "Foco H4 Narva 12V", cambio: true, aviso: null, productoIds: [46] });
    const escrituras = t.llamadas.filter((l) => l.method === "write");
    expect(escrituras).toEqual([{ method: "write", args: ["product.template", [45], { name: "Foco H4 Narva 12V" }] }]);
    const [modelo, tmplId, nota] = t.llamadas.find((l) => l.method === "messagePost")!.args as [string, number, { body: string; author_id: number }];
    expect(modelo).toBe("product.template");
    expect(tmplId).toBe(45);
    expect(nota.author_id).toBe(2179);
    expect(nota.body).toContain("Derlis cambió el nombre del producto");
    expect(nota.body).toContain("Foco H4 - Narva → <b>Foco H4 Narva 12V</b>");
  });

  it("junta espacios repetidos y recorta los bordes", async () => {
    const t = conEco(armar());
    const r = await cambiarNombreProducto(t.odoo, 46, "  Foco   H4  ", autor);
    expect(r.nuevo).toBe("Foco H4");
  });

  it("si el nombre no cambia no escribe ni anota nada", async () => {
    const t = armar({ nombre: "Foco H4" });
    const r = await cambiarNombreProducto(t.odoo, 46, " Foco H4 ", autor);
    expect(r.cambio).toBe(false);
    expect(t.llamadas.filter((l) => l.method !== "searchRead")).toHaveLength(0);
  });

  it("deja corregir solo mayúsculas del mismo producto: el duplicado se busca en otros", async () => {
    const t = conEco(armar({ nombre: "foco h4" }));
    const r = await cambiarNombreProducto(t.odoo, 46, "Foco H4", autor);
    expect(r.cambio).toBe(true);
    const dominio = JSON.stringify(t.llamadas[1].args[0]);
    expect(dominio).toContain('["product_tmpl_id","!=",45]');
    expect(dominio).toContain('["active","in",[true,false]]');
  });

  it("si la plantilla tiene variantes, devuelve todas: el nombre cambia en todas", async () => {
    const r = await cambiarNombreProducto(conEco(armar({ variantes: [47, 48] })).odoo, 46, "Foco H4", autor);
    expect(r.productoIds).toEqual([46, 47, 48]);
  });

  it("rechaza un nombre que ya usa otro producto, sin escribir", async () => {
    const t = armar({ duplicado: true });
    await expect(cambiarNombreProducto(t.odoo, 46, "Foco H4", autor)).rejects.toBeInstanceOf(ProductoDuplicado);
    expect(t.llamadas.some((l) => l.method === "write")).toBe(false);
  });

  it("rechaza productos inexistentes o archivados", async () => {
    await expect(cambiarNombreProducto(armar({ noExiste: true }).odoo, 46, "Foco H4", autor)).rejects.toBeInstanceOf(ProductoInvalido);
  });

  it("rechaza nombres vacíos, muy cortos o muy largos", async () => {
    for (const malo of ["", "  ", "ab", "x".repeat(121)]) {
      await expect(cambiarNombreProducto(armar().odoo, 46, malo, autor)).rejects.toBeInstanceOf(ZodError);
    }
    expect(esquemaNombre.parse("x".repeat(120))).toHaveLength(120);
  });

  it("si falla la nota, el nombre queda cambiado y se avisa", async () => {
    const r = await cambiarNombreProducto(conEco(armar({ fallarNota: true })).odoo, 46, "Foco H4", autor);
    expect(r.cambio).toBe(true);
    expect(r.aviso).toContain("nota de seguimiento");
  });

  it("si Odoo guardó otra cosa, devuelve lo que quedó y avisa", async () => {
    const r = await cambiarNombreProducto(armar({ odooGuarda: "Foco viejo" }).odoo, 46, "Foco H4", autor);
    expect(r.nuevo).toBe("Foco viejo");
    expect(r.aviso).toContain("Foco viejo");
  });

  it("la nota escapa los nombres", () => {
    expect(payloadNotaNombre({ autor: "A", anterior: "<i>a</i>", nuevo: "<b>x</b>" }).body).toContain("&lt;i&gt;a&lt;/i&gt; → <b>&lt;b&gt;x&lt;/b&gt;</b>");
  });
});
