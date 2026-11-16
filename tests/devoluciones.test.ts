import { describe, expect, it } from "vitest";
import { modeloDe, nuevaDevolucionSchema, porDia } from "@/lib/devoluciones-dominio";
import { menuDe, pantallasDe, puedeU } from "@/lib/permisos";

describe("devoluciones", () => {
  it("valida el alta", () => {
    expect(nuevaDevolucionSchema.safeParse({ tipo: "recupero", vehiculoId: "12", observacion: " Sin llave " }).data).toEqual({ tipo: "recupero", vehiculoId: 12, observacion: "Sin llave" });
    expect(nuevaDevolucionSchema.safeParse({ tipo: "otro", vehiculoId: 12, observacion: "Sin llave" }).success).toBe(false);
    expect(nuevaDevolucionSchema.safeParse({ tipo: "devolucion", vehiculoId: 12, observacion: "a" }).success).toBe(false);
    expect(nuevaDevolucionSchema.safeParse({ tipo: "devolucion", observacion: "Sin llave" }).success).toBe(false);
  });

  it("saca el modelo del nombre de Odoo", () => {
    expect(modeloDe("Kenton/GTR 150/827ABTI", "827ABTI")).toBe("Kenton GTR 150");
    expect(modeloDe("827ABTI", "827ABTI")).toBe("");
  });

  it("agrupa por día sin reordenar", () => {
    const dias = porDia([{ fecha: "2026-11-15", id: 3 }, { fecha: "2026-11-15", id: 2 }, { fecha: "2026-11-14", id: 1 }]);
    expect(dias.map((d) => [d.fecha, d.items.map((i) => i.id)])).toEqual([["2026-11-15", [3, 2]], ["2026-11-14", [1]]]);
  });

  it("jefe y admin registran; solo el admin borra; el mecánico y el cobrador no la ven", () => {
    expect(puedeU({ rol: "jefe" }, "devoluciones.registrar")).toBe(true);
    expect(puedeU({ rol: "jefe" }, "devoluciones.borrar")).toBe(false);
    expect(puedeU({ rol: "admin" }, "devoluciones.borrar")).toBe(true);
    expect(puedeU({ rol: "mecanico" }, "devoluciones.ver")).toBe(false);
    expect(puedeU({ rol: "cobrador" }, "devoluciones.ver")).toBe(false);
    expect(puedeU({ rol: "jefe", permisosOff: ["registrar_devoluciones"] }, "devoluciones.registrar")).toBe(false);
    expect(puedeU({ rol: "jefe", permisosOff: ["registrar_devoluciones"] }, "devoluciones.ver")).toBe(true);
    expect(menuDe(pantallasDe({ rol: "jefe" })).some((p) => p.href === "/devoluciones")).toBe(true);
    expect(menuDe(pantallasDe({ rol: "mecanico" })).some((p) => p.href === "/devoluciones")).toBe(false);
  });
});
