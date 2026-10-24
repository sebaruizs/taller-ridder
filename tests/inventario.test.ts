import { describe, expect, it } from "vitest";
import { dominioProductos, tipoMovimiento, valorStock } from "@/lib/inventario-dominio";
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

  it("el valor en stock no cuenta cantidades negativas", () => {
    expect(valorStock(3, 20000)).toBe(60000);
    expect(valorStock(-2, 20000)).toBe(0);
  });

  it("montos grandes se resumen en millones", () => {
    expect(gsCorto(5_101_555_277)).toBe("Gs. 5.102 M");
    expect(gsCorto(20000)).toBe("Gs. 20.000");
  });

  it("el mecánico no ve inventario; al jefe se le puede quitar", () => {
    expect(puedeU({ rol: "mecanico", permisosOff: [] }, "inventario.ver")).toBe(false);
    expect(puedeU({ rol: "jefe", permisosOff: [] }, "inventario.ver")).toBe(true);
    expect(puedeU({ rol: "jefe", permisosOff: ["inventario"] }, "inventario.ver")).toBe(false);
    expect(inicioDe({ rol: "jefe", permisosOff: ["ver_ordenes", "tablero", "aprobar", "repuestos", "crear"] })).toBe("/inventario");
  });
});
