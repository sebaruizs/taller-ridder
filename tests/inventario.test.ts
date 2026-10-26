import { describe, expect, it } from "vitest";
import { costoApp, dominioProductos, tipoMovimiento, ultimasCompras } from "@/lib/inventario-dominio";
import { gsCorto } from "@/lib/formato";
import { inicioDe, puedeU } from "@/lib/permisos";

describe("inventario", () => {
  it("lista solo productos con stock controlado y activos, filtrando en Odoo", () => {
    expect(dominioProductos({})).toEqual([["is_storable", "=", true], ["active", "=", true]]);
  });

  it("busca por nombre o código, categoría (con subcategorías) y stock", () => {
    expect(dominioProductos({ q: " foco ", categoriaId: 7, stock: "con" })).toEqual([
      ["is_storable", "=", true],
      ["active", "=", true],
      "|", ["name", "ilike", "foco"], ["default_code", "ilike", "foco"],
      ["categ_id", "child_of", 7],
      ["qty_available", ">", 0],
    ]);
    expect(dominioProductos({ stock: "sin" })).toContainEqual(["qty_available", "<=", 0]);
  });

  it("entrada si llega al depósito, salida si sale", () => {
    expect(tipoMovimiento(false, true)).toBe("entrada");
    expect(tipoMovimiento(true, false)).toBe("salida");
    expect(tipoMovimiento(true, true)).toBe("interno");
  });

  it("el costo de la app es el precio de la última compra, separado del de Odoo", () => {
    const ultimas = ultimasCompras([
      { product_id: [5, "Foco H4"], price_unit: 22300, date_order: "2026-10-20 13:00:00", partner_id: [9, "Repuestos SA"] },
      { product_id: [5, "Foco H4"], price_unit: 18000, date_order: "2026-08-01 10:00:00", partner_id: [9, "Repuestos SA"] },
      { product_id: false, price_unit: 1, date_order: false, partner_id: false },
    ]);
    expect(costoApp(ultimas.get(5), 20000)).toEqual({ costo: 22300, origen: "compra", fecha: "2026-10-20", proveedor: "Repuestos SA" });
  });

  it("sin compras registradas usa el costo de Odoo y lo indica", () => {
    expect(costoApp(undefined, 20000)).toEqual({ costo: 20000, origen: "odoo", fecha: null, proveedor: null });
  });

  it("montos grandes se resumen en millones", () => {
    expect(gsCorto(5_101_555_277)).toBe("Gs. 5.102 M");
    expect(gsCorto(20000)).toBe("Gs. 20.000");
  });

  it("el mecánico no ve inventario; al jefe se le puede quitar", () => {
    expect(puedeU({ rol: "mecanico", permisosOff: [] }, "inventario.ver")).toBe(false);
    expect(puedeU({ rol: "jefe", permisosOff: [] }, "inventario.ver")).toBe(true);
    expect(puedeU({ rol: "jefe", permisosOff: ["inventario"] }, "inventario.ver")).toBe(false);
    expect(inicioDe({ rol: "jefe", permisosOff: ["ver_ordenes", "tablero", "aprobar", "repuestos", "crear", "reportes"] })).toBe("/inventario");
  });
});
