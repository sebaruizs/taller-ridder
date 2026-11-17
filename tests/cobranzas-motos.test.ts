import { beforeEach, describe, expect, it, vi } from "vitest";

const config = { COBRANZAS_URL: "http://cobranzas.test", TALLER_LECTURA_SECRET: "s".repeat(40) };
vi.mock("@/lib/env", () => ({ env: () => config }));
const { olvidarCache, recuperosDe, recuperosDeCobranzas } = await import("@/lib/cobranzas-motos");

const respuesta = {
  generado: "2026-11-17 16:40:00",
  motivos: ["recupero"],
  motos: [{ vehiculoId: 199, chapa: "819ABTK", modelo: "Kenton/GTR150 LTD", motivo: "recupero", desde: null, cliente: "Ernesto Soler", partnerId: 1541, suscripcion: "cerrada", diasAtraso: 0 }],
};
const llamadas: string[] = [];
let estado = 200;
globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
  llamadas.push(`${url} ${(init?.headers as Record<string, string>).Authorization.slice(0, 9)}`);
  return new Response(JSON.stringify(respuesta), { status: estado });
}) as typeof fetch;

describe("motos a devolver desde Cobranzas", () => {
  beforeEach(() => {
    olvidarCache();
    llamadas.length = 0;
    estado = 200;
  });

  it("lee los recuperos con la clave de lectura", async () => {
    expect(await recuperosDeCobranzas(1000)).toEqual(new Map([[199, { cliente: "Ernesto Soler", desde: null }]]));
    expect(llamadas).toEqual(["http://cobranzas.test/api/integraciones/taller/motos-a-devolver Bearer ss"]);
  });

  it("consulta a lo sumo cada 5 minutos", async () => {
    await recuperosDeCobranzas(1000);
    await recuperosDeCobranzas(1000 + 4 * 60_000);
    expect(llamadas).toHaveLength(1);
    await recuperosDeCobranzas(1000 + 5 * 60_000 + 1);
    expect(llamadas).toHaveLength(2);
  });

  it("si Cobranzas falla: lo último leído, o null si nunca se leyó (Taller va a Odoo)", async () => {
    estado = 503;
    expect(await recuperosDeCobranzas(1000)).toBeNull();
    estado = 200;
    await recuperosDeCobranzas(2000);
    estado = 500;
    expect((await recuperosDeCobranzas(2000 + 6 * 60_000))?.has(199)).toBe(true);
  });

  it("sin URL o con clave corta no consulta", async () => {
    config.TALLER_LECTURA_SECRET = "corta";
    try {
      expect(await recuperosDeCobranzas(1000)).toBeNull();
      expect(llamadas).toHaveLength(0);
    } finally {
      config.TALLER_LECTURA_SECRET = "s".repeat(40);
    }
  });

  it("si Cobranzas no sabe de recuperos, no se toma su lista vacía como verdad", () => {
    expect(() => recuperosDe({ motivos: [], motos: [] })).toThrow("no informa recuperos");
  });
});
