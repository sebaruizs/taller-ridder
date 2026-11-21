// Las rutas reales del tablero: cuándo sale el aviso al teléfono y que nunca frena el cambio. Odoo, la sesión y Acceso
// son dobles; la base es PGlite.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "taller-avisos-rutas-"));
Object.assign(process.env, {
  DATABASE_URL: `pglite://${dir}`,
  SESSION_SECRET: "x".repeat(40),
  ODOO_URL: "http://odoo.invalid",
  ODOO_DB: "prueba",
  ODOO_USER: "api",
  ODOO_API_KEY: "clave",
  ACCESO_URL: "https://acceso.invalid",
  ACCESO_AVISOS_SECRET: "clave-de-avisos-de-prueba-0123456789abcdef",
});

const orden: { id: number; state: string; vehicle_id: [number, string]; vendor_id: [number, string] | false } = { id: 4366, state: "new", vehicle_id: [7, "Kenton/GTR/409ABSM"], vendor_id: [2009, "Diego"] };
const sesion = { actual: { id: 0, usuario: "jefe.taller", nombre: "Jefe", rol: "jefe", odooPartnerId: null as number | null, permisosOff: [], tema: "claro" } };

vi.mock("@/lib/odoo", () => ({
  OdooError: class extends Error {},
  odoo: {
    async read() { return [{ ...orden }]; },
    async write(_m: string, _ids: number[], vals: { state?: string; vendor_id?: number }) {
      if (vals.state) orden.state = vals.state;
      if (vals.vendor_id) orden.vendor_id = [vals.vendor_id, "x"];
      return true;
    },
    async messagePost() { return 1; },
  },
}));
vi.mock("@/lib/auth", () => {
  class NoAutorizado extends Error { status = 401; }
  return { NoAutorizado, exigir: async () => sesion.actual, registrar: async () => {}, usuarioDePedido: async () => null };
});
vi.mock("@/lib/usuarios", async (original) => ({
  ...(await original<typeof import("@/lib/usuarios")>()),
  mecanicosOdoo: async () => [{ id: 2009, nombre: "Diego" }, { id: 2010, nombre: "Angel" }],
}));

import { getDb, schema } from "@/lib/db";
import { POST as mover } from "@/app/api/ordenes/[id]/mover/route";
import { POST as iniciar } from "@/app/api/ordenes/[id]/iniciar/route";
import { POST as cambiar } from "@/app/api/ordenes/[id]/mecanico/route";

const avisos: { usuario?: string; usuarios?: string[]; cuerpo: string; ruta: string; clave: string }[] = [];
let accesoCaido = false;
let diegoId = 0;
const ctx = { params: Promise.resolve({ id: "4366" }) };
const pedido = (cuerpo: unknown = {}) => new Request("http://taller.invalid/api/ordenes/4366/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });

beforeAll(async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    if (accesoCaido) throw new Error("ECONNREFUSED");
    avisos.push(JSON.parse(String(init.body)));
    return Response.json({ enviados: 1, sinTelefono: false }, { status: 202 });
  }));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const db = await getDb();
  const [d] = await db.insert(schema.usuarios).values([
    { usuario: "diego.m", nombre: "Diego", rol: "mecanico", passwordHash: "x", odooPartnerId: 2009 },
    { usuario: "angel.m", nombre: "Angel", rol: "mecanico", passwordHash: "x", odooPartnerId: 2010 },
  ]).returning();
  diegoId = d.id;
});
beforeEach(() => {
  avisos.length = 0;
  accesoCaido = false;
  Object.assign(orden, { state: "new", vendor_id: [2009, "Diego"] });
  sesion.actual = { ...sesion.actual, id: 0, odooPartnerId: null };
});
afterAll(() => {
  vi.unstubAllGlobals();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("aviso al teléfono desde las rutas del tablero", () => {
  it("Nuevo → En proceso con mecánico: un aviso a su usuario, con el id de la orden como tarea", async () => {
    const r = await mover(pedido({ de: "new", a: "running" }), ctx as never);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ chapa: "409ABSM", aviso: null });
    expect(avisos).toEqual([{ usuario: "diego.m", titulo: "Taller", cuerpo: "Tenés una tarea nueva", ruta: "/tareas/4366", clave: "taller.tarea.4366.asignada.diego.m" }]);
  });

  it("«Iniciar» avisa igual", async () => {
    expect((await iniciar(pedido(), ctx as never)).status).toBe(200);
    expect(avisos.map((a) => a.usuario)).toEqual(["diego.m"]);
  });

  it("salir de En proceso no avisa", async () => {
    orden.state = "running";
    expect((await mover(pedido({ de: "running", a: "to_be_paid" }), ctx as never)).status).toBe(200);
    orden.state = "running";
    expect((await mover(pedido({ de: "running", a: "new" }), ctx as never)).status).toBe(200);
    expect(avisos).toEqual([]);
  });

  it("sin mecánico asignado: «tarea disponible» a todos los mecánicos, en una sola llamada y a la lista", async () => {
    orden.vendor_id = false;
    expect((await iniciar(pedido(), ctx as never)).status).toBe(200);
    expect(avisos).toEqual([{ usuarios: ["angel.m", "diego.m"], titulo: "Taller", cuerpo: "Hay una tarea nueva disponible", ruta: "/tareas", clave: "taller.tarea.4366.disponible" }]);
  });

  it("sin mecánico, si la inicia un mecánico se avisa a los demás", async () => {
    orden.vendor_id = false;
    sesion.actual = { ...sesion.actual, id: diegoId, odooPartnerId: 2009 };
    expect((await iniciar(pedido(), ctx as never)).status).toBe(200);
    expect(avisos.map((a) => a.usuarios)).toEqual([["angel.m"]]);
  });

  it("devuelta de verificación: «te devolvieron una tarea» al mecánico", async () => {
    orden.state = "cancelled";
    expect((await mover(pedido({ de: "cancelled", a: "running" }), ctx as never)).status).toBe(200);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ usuario: "diego.m", cuerpo: "Te devolvieron una tarea", ruta: "/tareas/4366" });
    expect(avisos[0].clave).toMatch(/^taller\.tarea\.4366\.devuelta\.diego\.m\.\d+$/);
  });

  it("desbloqueada: al mecánico; sin mecánico, a todos", async () => {
    orden.state = "to_be_paid";
    expect((await mover(pedido({ de: "to_be_paid", a: "running" }), ctx as never)).status).toBe(200);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ usuario: "diego.m", cuerpo: "Se desbloqueó una tarea", ruta: "/tareas/4366" });
    expect(avisos[0].clave).toMatch(/^taller\.tarea\.4366\.desbloqueada\.diego\.m\.\d+$/);
    avisos.length = 0;
    Object.assign(orden, { state: "to_be_paid", vendor_id: false });
    expect((await mover(pedido({ de: "to_be_paid", a: "running" }), ctx as never)).status).toBe(200);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ usuarios: ["angel.m", "diego.m"], cuerpo: "Se desbloqueó una tarea", ruta: "/tareas" });
  });

  it("si la inicia el mismo mecánico, no se avisa a sí mismo", async () => {
    sesion.actual = { ...sesion.actual, id: diegoId, odooPartnerId: 2009 };
    expect((await iniciar(pedido(), ctx as never)).status).toBe(200);
    expect(avisos).toEqual([]);
  });

  it("con Acceso caído la orden se mueve igual", async () => {
    accesoCaido = true;
    const r = await iniciar(pedido(), ctx as never);
    expect(r.status).toBe(200);
    expect(orden.state).toBe("running");
  });

  it("cambiar el mecánico de una orden En proceso avisa al nuevo; en otra etapa no", async () => {
    orden.state = "running";
    const r = await cambiar(pedido({ mecanicoId: 2010 }), ctx as never);
    expect(await r.json()).toEqual({ chapa: "409ABSM", de: "Diego", a: "Angel", aviso: null });
    expect(avisos.map((a) => a.clave)).toEqual(["taller.tarea.4366.asignada.angel.m"]);
    avisos.length = 0;
    Object.assign(orden, { state: "cancelled", vendor_id: [2009, "Diego"] });
    expect((await cambiar(pedido({ mecanicoId: 2010 }), ctx as never)).status).toBe(200);
    expect(avisos).toEqual([]);
  });
});
