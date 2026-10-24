import { describe, expect, it } from "vitest";
import { MAX_INTENTOS, estaBloqueado, pinSchema, trasIntentoFallido } from "@/lib/pin";

describe("PIN", () => {
  it("acepta de 4 a 6 dígitos", () => {
    expect(pinSchema.safeParse("1234").success).toBe(true);
    expect(pinSchema.safeParse("123456").success).toBe(true);
    expect(pinSchema.safeParse("123").success).toBe(false);
    expect(pinSchema.safeParse("1234567").success).toBe(false);
    expect(pinSchema.safeParse("12a4").success).toBe(false);
  });

  it(`bloquea después de ${MAX_INTENTOS} intentos fallidos`, () => {
    const ahora = new Date("2026-10-24T12:00:00Z");
    let e = { intentosFallidos: 0, bloqueadoHasta: null as Date | null };
    for (let i = 1; i < MAX_INTENTOS; i++) {
      e = trasIntentoFallido(e, ahora);
      expect(estaBloqueado(e, ahora)).toBe(false);
    }
    e = trasIntentoFallido(e, ahora);
    expect(estaBloqueado(e, ahora)).toBe(true);
    expect(estaBloqueado(e, new Date(ahora.getTime() + 16 * 60_000))).toBe(false);
  });

  it("al vencer el bloqueo vuelve a contar desde cero", () => {
    const ahora = new Date("2026-10-24T12:00:00Z");
    const vencido = { intentosFallidos: 4, bloqueadoHasta: new Date(ahora.getTime() - 1000) };
    expect(trasIntentoFallido(vencido, ahora)).toEqual({ intentosFallidos: 1, bloqueadoHasta: null });
  });
});
