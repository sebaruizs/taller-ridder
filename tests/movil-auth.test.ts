import { describe, expect, it, vi } from "vitest";
import { armarEnlace, armarFicha, VIDA_FICHA_MS } from "@/lib/acceso-dominio";

const SECRETO = "clave-compartida-de-acceso-con-taller-0123456789";
const TOKEN = "token-de-prueba-largo-1234";
const config = { MOVIL_FICHA_ACCESO: false, ACCESO_SECRET: SECRETO, MOVIL_PRUEBA_TOKEN: TOKEN };
vi.mock("@/lib/env", () => ({ env: () => config }));
const { loginDeDispositivo } = await import("@/lib/movil-auth");

const AHORA = 1_800_000_000_000;
const bearer = (v: string) => `Bearer ${v}`;

describe("credencial de la API móvil (loginDeDispositivo)", () => {
  it("con la ficha apagada, una ficha válida no sirve; el token de prueba sí (fuera de producción)", () => {
    config.MOVIL_FICHA_ACCESO = false;
    expect(loginDeDispositivo(bearer(armarFicha(SECRETO, "carlos.ramirez", AHORA + 60_000)), AHORA)).toBeNull();
    expect(loginDeDispositivo(bearer(`carlos.ramirez.${TOKEN}`), AHORA)).toBe("carlos.ramirez");
  });

  it("con la ficha prendida: acepta la de Acceso, también en producción", () => {
    config.MOVIL_FICHA_ACCESO = true;
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(loginDeDispositivo(bearer(armarFicha(SECRETO, "carlos.ramirez", AHORA + VIDA_FICHA_MS)), AHORA)).toBe("carlos.ramirez");
      // En producción el token de prueba nunca sirve.
      expect(loginDeDispositivo(bearer(`carlos.ramirez.${TOKEN}`), AHORA)).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rechaza la ficha vencida, la de vida demasiado larga, la de otra clave y el enlace web de un solo uso", () => {
    config.MOVIL_FICHA_ACCESO = true;
    const login = (t: string) => loginDeDispositivo(bearer(t), AHORA);
    expect(login(armarFicha(SECRETO, "carlos.ramirez", AHORA))).toBeNull();
    expect(login(armarFicha(SECRETO, "carlos.ramirez", AHORA + VIDA_FICHA_MS + 1))).toBeNull();
    expect(login(armarFicha("otra-clave-de-treinta-y-dos-caracteres!!", "carlos.ramirez", AHORA + 60_000))).toBeNull();
    // Mismo formato pero origen "acceso": un enlace de /entrar/acceso no sirve como ficha.
    expect(login(armarEnlace(SECRETO, "carlos.ramirez", AHORA + 60_000))).toBeNull();
  });

  it("con la clave corta, la ficha queda apagada aunque el interruptor esté prendido", () => {
    config.MOVIL_FICHA_ACCESO = true;
    config.ACCESO_SECRET = "corta";
    try {
      expect(loginDeDispositivo(bearer(armarFicha("corta", "carlos.ramirez", AHORA + 60_000)), AHORA)).toBeNull();
    } finally {
      config.ACCESO_SECRET = SECRETO;
    }
  });
});
