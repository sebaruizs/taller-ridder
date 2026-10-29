import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ registrar: vi.fn(async () => {}) }));
vi.mock("@/lib/odoo", () => ({ odoo: { messagePost: vi.fn(async () => 1) } }));
vi.mock("@/lib/taller", () => ({ MODELO_ORDEN: "x", conAutor: (p: unknown) => p }));
vi.mock("@/lib/env", () => ({ env: () => ({ TRACCAR_URL: "http://nuevo", TRACCAR_TOKEN: "t-nuevo", TRACCAR_ANTERIOR_URL: "http://anterior", TRACCAR_ANTERIOR_TOKEN: "t-ant" }) }));

const viejo = "2026-10-01T00:00:00Z";
const reciente = new Date().toISOString();
let anteriorSpeed = 0;
const llamadas: string[] = [];
const resp = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
  const u = new URL(String(url));
  llamadas.push(`${init?.method ?? "GET"} ${u.host}${u.pathname}${u.search} ${init?.body ?? ""}`.trim());
  if (u.host === "nuevo") {
    if (u.pathname === "/api/devices") return resp([
      { id: 3, name: "393ABSM", uniqueId: "864", status: "offline", lastUpdate: viejo, positionId: 13, attributes: {} },
      { id: 5, name: "725ABSR", uniqueId: "999", status: "online", lastUpdate: reciente, positionId: 15, attributes: {} },
    ]);
    if (u.pathname === "/api/positions") return resp([{ id: 13, deviceId: 3, fixTime: viejo, speed: 0, attributes: {} }, { id: 15, deviceId: 5, fixTime: reciente, speed: 0, attributes: {} }]);
    if (u.pathname === "/api/commands/types") return resp([{ type: "engineStop" }, { type: "engineResume" }]);
    if (u.pathname === "/api/commands/send") return resp({}, 200);
  }
  if (u.host === "anterior") {
    if (u.pathname === "/api/devices" && u.searchParams.has("uniqueId")) return resp([{ id: 91, name: "393ABSM", uniqueId: "864", status: "online", lastUpdate: reciente, positionId: 77 }]);
    if (u.pathname === "/api/devices") return resp([{ id: 91, name: "393ABSM", uniqueId: "864", status: "online", lastUpdate: reciente, positionId: 77 }]);
    if (u.pathname === "/api/positions") return resp([{ id: 77, deviceId: 91, fixTime: reciente, speed: anteriorSpeed, attributes: {} }]);
    if (u.pathname === "/api/commands/types") return resp([{ type: "engineStop" }, { type: "engineResume" }]);
    if (u.pathname === "/api/commands/send") return resp({}, 200);
  }
  return resp({}, 404);
}) as typeof fetch;

const { cambiarEncendido } = await import("@/lib/gps");
const u = { id: 1, nombre: "Prueba", odooPartnerId: null } as never;

describe("bloqueo por Traccar anterior", () => {
  beforeEach(() => { llamadas.length = 0; anteriorSpeed = 0; });
  it("fuera de línea en el nuevo y reportando en el anterior: manda al anterior", async () => {
    const r = await cambiarEncendido({ chapa: "393ABSM", accion: "bloquear", confirmaEnMovimiento: false }, u);
    expect(llamadas.some((l) => l.startsWith("POST anterior/api/commands/send") && l.includes('"deviceId":91'))).toBe(true);
    expect(llamadas.some((l) => l.startsWith("POST nuevo/api/commands"))).toBe(false);
    expect(r.mensaje).toContain("Traccar anterior");
  });
  it("en movimiento según el anterior: pide confirmar", async () => {
    anteriorSpeed = 20; // nudos
    await expect(cambiarEncendido({ chapa: "393ABSM", accion: "bloquear", confirmaEnMovimiento: false }, u)).rejects.toThrow("37 km/h");
  });
  it("en línea en el nuevo: manda al nuevo", async () => {
    await cambiarEncendido({ chapa: "725ABSR", accion: "bloquear", confirmaEnMovimiento: false }, u);
    expect(llamadas.some((l) => l.startsWith("POST nuevo/api/commands/send") && l.includes('"deviceId":5'))).toBe(true);
    expect(llamadas.some((l) => l.includes("anterior/api/commands"))).toBe(false);
  });
});
