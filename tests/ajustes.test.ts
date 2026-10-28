import { describe, expect, it } from "vitest";
import { COLORES_POR_DEFECTO, colorReporte, coloresSchema, leerColores } from "@/lib/ajustes-dominio";

describe("colores del último reporte del GPS", () => {
  const ahora = Date.parse("2026-10-28T20:00:00Z");
  const hace = (h: number) => new Date(ahora - h * 3_600_000).toISOString();
  it("por defecto: verde < 5 h, amarillo < 1 día, rojo desde 1 día", () => {
    expect(colorReporte(hace(1), COLORES_POR_DEFECTO, ahora)).toBe("verde");
    expect(colorReporte(hace(5), COLORES_POR_DEFECTO, ahora)).toBe("amarillo");
    expect(colorReporte(hace(23), COLORES_POR_DEFECTO, ahora)).toBe("amarillo");
    expect(colorReporte(hace(24), COLORES_POR_DEFECTO, ahora)).toBe("rojo");
    expect(colorReporte(null, COLORES_POR_DEFECTO, ahora)).toBeNull();
  });
  it("respeta lo que configure el admin", () => {
    expect(colorReporte(hace(3), { amarilloDesdeHoras: 2, rojoDesdeHoras: 4 }, ahora)).toBe("amarillo");
  });
  it("valida que rojo empiece después que amarillo, y si lo guardado no sirve usa los valores por defecto", () => {
    expect(coloresSchema.safeParse({ amarilloDesdeHoras: 5, rojoDesdeHoras: 5 }).success).toBe(false);
    expect(leerColores({ amarilloDesdeHoras: "x" })).toEqual(COLORES_POR_DEFECTO);
    expect(leerColores({ amarilloDesdeHoras: 2, rojoDesdeHoras: 48 })).toEqual({ amarilloDesdeHoras: 2, rojoDesdeHoras: 48 });
  });
});
