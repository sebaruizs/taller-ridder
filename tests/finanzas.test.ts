import { describe, expect, it } from "vitest";
import { agruparPorEmpresa, csvCierre, empresaDeMoto, periodoDeMes, type Moto } from "@/lib/finanzas-dominio";
import { puedeU } from "@/lib/permisos";

const motos = new Map<number, Moto>([
  [1, { id: 1, chapa: "129ABOD", empresaId: 111, empresa: "DriveX" }],
  [2, { id: 2, chapa: "055ABTK", empresaId: 1, empresa: "Redi EAS" }],
  [3, { id: 3, chapa: "803ABTK", empresaId: 1, empresa: "Redi EAS" }],
]);

describe("finanzas", () => {
  it("el período de un mes va del primer al último día", () => {
    expect(periodoDeMes("2026-09")).toEqual({ mes: "2026-09", desde: "2026-09-01", hasta: "2026-09-30" });
    expect(periodoDeMes("2028-02").hasta).toBe("2028-02-29");
  });

  it("las motos sin dueño son de Redi EAS", () => {
    expect(empresaDeMoto(false)).toEqual({ id: 1, nombre: "Redi EAS" });
    expect(empresaDeMoto([111, "DriveX"])).toEqual({ id: 111, nombre: "DriveX" });
  });

  it("reparte cobros y gastos de taller por empresa y por moto", () => {
    const { empresas, sinMoto } = agruparPorEmpresa(
      motos,
      [{ motoId: 1, monto: 500_000 }, { motoId: 1, monto: 100_000 }, { motoId: 2, monto: 300_000 }, { motoId: null, monto: 40_000 }],
      [
        { id: 10, motoId: 1, monto: 150_000, fecha: "2026-09-02", tipo: "Mantenimiento", estado: "done" },
        { id: 11, motoId: 3, monto: 80_000, fecha: "2026-09-05", tipo: "Reparación", estado: "done" },
        { id: 12, motoId: null, monto: 5_000, fecha: "2026-09-06", tipo: null, estado: "done" },
      ],
    );
    expect(empresas.map((e) => [e.nombre, e.cobrado, e.taller, e.resultado])).toEqual([
      ["DriveX", 600_000, 150_000, 450_000],
      ["Redi EAS", 300_000, 80_000, 220_000],
    ]);
    // Primero las motos que dejan menos.
    expect(empresas[1].motos.map((m) => [m.chapa, m.resultado, m.ordenes])).toEqual([["803ABTK", -80_000, 1], ["055ABTK", 300_000, 0]]);
    expect(sinMoto).toEqual({ cobrado: 40_000, taller: 5_000 });
  });

  it("el CSV del cierre se abre en Excel en español", () => {
    const { empresas } = agruparPorEmpresa(motos, [{ motoId: 1, monto: 600_000.4 }], []);
    const csv = csvCierre(empresas[0], periodoDeMes("2026-09"));
    expect(csv.split("\r\n")).toEqual([
      '"Empresa";"DriveX"',
      '"Período";"2026-09-01 a 2026-09-30"',
      "",
      '"Moto";"Cobrado";"Gasto taller";"Resultado";"Órdenes de taller"',
      '"129ABOD";600000;0;600000;0',
      "",
      '"Total";600000;0;600000',
    ]);
  });

  it("el mecánico no ve finanzas; al jefe se le puede apagar el módulo", () => {
    expect(puedeU({ rol: "mecanico", permisosOff: [] }, "finanzas.ver")).toBe(false);
    expect(puedeU({ rol: "jefe", permisosOff: ["modulo.finanzas"] }, "finanzas.ver")).toBe(false);
    expect(puedeU({ rol: "jefe", permisosOff: [] }, "finanzas.ver")).toBe(true);
  });
});
