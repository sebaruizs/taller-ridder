// Avisos al teléfono: Taller le pide a Ridder Acceso que avise. Base PGlite real; Acceso es un fetch falso.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "taller-avisos-"));
const CLAVE = "clave-de-avisos-de-prueba-0123456789abcdef";
Object.assign(process.env, {
  DATABASE_URL: `pglite://${dir}`,
  SESSION_SECRET: "x".repeat(40),
  ODOO_URL: "http://odoo.invalid",
  ODOO_DB: "prueba",
  ODOO_USER: "api",
  ODOO_API_KEY: "clave",
  ACCESO_URL: "https://acceso.invalid/",
  ACCESO_AVISOS_SECRET: CLAVE,
});

import { getDb, schema } from "@/lib/db";
import { TANDA, avisarEntradaEnProceso, avisarTareaAsignada, avisoTareaAsignada, destinoAvisos, enviarAviso } from "@/lib/avisos";
import { cambiarMecanico, iniciarOrden, moverOrden } from "@/lib/tablero";

type Pedido = { url: string; init: RequestInit };
const pedidos: Pedido[] = [];
let respuesta: () => Promise<Response> = async () => Response.json({ enviados: 1, sinTelefono: false }, { status: 202 });
const cuerpos = () => pedidos.map((p) => JSON.parse(String(p.init.body)));
let jefeId = 0;
let diegoId = 0;

beforeAll(async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => { pedidos.push({ url: String(url), init }); return respuesta(); }));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const db = await getDb();
  const filas = await db.insert(schema.usuarios).values([
    { usuario: "jefe.taller", nombre: "Jefe", rol: "jefe", passwordHash: "x" },
    { usuario: "diego.m", nombre: "Diego", rol: "mecanico", passwordHash: "x", odooPartnerId: 2009 },
    { usuario: "diego.viejo", nombre: "Diego (baja)", rol: "mecanico", passwordHash: "x", odooPartnerId: 2009, activo: false },
    { usuario: "angel.m", nombre: "Angel", rol: "mecanico", passwordHash: "x", odooPartnerId: 2010 },
  ]).returning();
  jefeId = filas[0].id;
  diegoId = filas[1].id;
});
afterEach(() => {
  pedidos.length = 0;
  respuesta = async () => Response.json({ enviados: 1, sinTelefono: false }, { status: 202 });
});
afterAll(() => {
  vi.unstubAllGlobals();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("aviso de tarea asignada", () => {
  it("el texto es genérico y la ruta lleva el id de la tarea", () => {
    expect(avisoTareaAsignada(4366, "diego.m")).toEqual({ usuario: "diego.m", titulo: "Taller", cuerpo: "Tenés una tarea nueva", ruta: "/tareas/4366", clave: "taller.tarea.4366.asignada.diego.m" });
  });

  it("llama a Acceso con la clave, el módulo y el usuario local del mecánico (solo el activo)", async () => {
    await avisarTareaAsignada(4366, 2009, jefeId);
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].url).toBe("https://acceso.invalid/api/acceso/avisos");
    expect(pedidos[0].init.method).toBe("POST");
    expect(pedidos[0].init.headers).toMatchObject({ Authorization: `Bearer ${CLAVE}`, "X-Ridder-Modulo": "taller" });
    expect(pedidos[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(cuerpos()).toEqual([avisoTareaAsignada(4366, "diego.m")]);
  });

  it("no avisa si quien asigna es el mismo mecánico", async () => {
    await avisarTareaAsignada(4366, 2009, diegoId);
    expect(pedidos).toHaveLength(0);
  });

  it("no avisa si la orden no tiene mecánico o el contacto no tiene usuario en Taller", async () => {
    await avisarTareaAsignada(4366, null, jefeId);
    await avisarTareaAsignada(4366, 9999, jefeId);
    expect(pedidos).toHaveLength(0);
  });

  it("sin clave, con clave corta o sin URL de Acceso queda apagado", () => {
    expect(destinoAvisos({ ACCESO_URL: "https://acceso.invalid/", ACCESO_AVISOS_SECRET: CLAVE })).toEqual({ url: "https://acceso.invalid/api/acceso/avisos", secreto: CLAVE });
    expect(destinoAvisos({ ACCESO_URL: "https://acceso.invalid", ACCESO_AVISOS_SECRET: "" })).toBeNull();
    expect(destinoAvisos({ ACCESO_URL: "https://acceso.invalid", ACCESO_AVISOS_SECRET: "corta" })).toBeNull();
    expect(destinoAvisos({ ACCESO_URL: "", ACCESO_AVISOS_SECRET: CLAVE })).toBeNull();
  });

  it("si Acceso falla, tarda o responde 404, no lanza y no reintenta", async () => {
    respuesta = async () => { throw new DOMException("The operation timed out.", "TimeoutError"); };
    await expect(avisarTareaAsignada(4366, 2009, jefeId)).resolves.toBeUndefined();
    respuesta = async () => Response.json({ error: "no existe" }, { status: 404 });
    expect(await enviarAviso(avisoTareaAsignada(4366, "nadie"))).toBe("fallo");
    respuesta = async () => new Response("<html>", { status: 502 });
    await expect(avisarTareaAsignada(4366, 2009, jefeId)).resolves.toBeUndefined();
    expect(pedidos).toHaveLength(3);
  });
});

describe("avisos a todos los mecánicos", () => {
  it("van solo a mecánicos activos con contacto de Odoo, sin quien hizo el cambio, en tandas de 50", async () => {
    const db = await getDb();
    await db.insert(schema.usuarios).values([
      { usuario: "sin.contacto", nombre: "Sin contacto", rol: "mecanico", passwordHash: "x" },
      { usuario: "cobrador.con.contacto", nombre: "Cobrador", rol: "cobrador", passwordHash: "x", odooPartnerId: 3000 },
      ...Array.from({ length: 58 }, (_, i) => ({ usuario: `mec.${String(i).padStart(2, "0")}`, nombre: `Mec ${i}`, rol: "mecanico" as const, passwordHash: "x", odooPartnerId: 5000 + i })),
    ]);
    await avisarEntradaEnProceso({ ordenId: 4366, de: "new", mecanicoPartnerId: null, autorId: diegoId });
    const tandas = cuerpos().map((c) => c.usuarios as string[]);
    expect(tandas.map((t) => t.length)).toEqual([TANDA, 9]);
    const todos = tandas.flat();
    expect(new Set(todos).size).toBe(59);
    expect(todos).toContain("angel.m");
    for (const fuera of ["diego.m", "diego.viejo", "sin.contacto", "cobrador.con.contacto", "jefe.taller"]) expect(todos).not.toContain(fuera);
    expect(cuerpos().every((c) => c.clave === "taller.tarea.4366.disponible" && c.ruta === "/tareas" && c.usuario === undefined)).toBe(true);
  });

  it("una orden devuelta sin mecánico no avisa a nadie", async () => {
    await avisarEntradaEnProceso({ ordenId: 4366, de: "cancelled", mecanicoPartnerId: null, autorId: jefeId });
    expect(pedidos).toHaveLength(0);
  });

  it("una orden nueva con mecánico sin usuario en Taller no se le avisa a todos", async () => {
    await avisarEntradaEnProceso({ ordenId: 4366, de: "new", mecanicoPartnerId: 9999, autorId: jefeId });
    expect(pedidos).toHaveLength(0);
  });

  it("devuelta y desbloqueada llevan el momento en la clave: se pueden repetir con la misma orden", async () => {
    await avisarEntradaEnProceso({ ordenId: 4366, de: "cancelled", mecanicoPartnerId: 2009, autorId: jefeId }, 100);
    await avisarEntradaEnProceso({ ordenId: 4366, de: "cancelled", mecanicoPartnerId: 2009, autorId: jefeId }, 200);
    await avisarEntradaEnProceso({ ordenId: 4366, de: "to_be_paid", mecanicoPartnerId: 2009, autorId: jefeId }, 300);
    expect(cuerpos().map((c) => c.clave)).toEqual(["taller.tarea.4366.devuelta.diego.m.100", "taller.tarea.4366.devuelta.diego.m.200", "taller.tarea.4366.desbloqueada.diego.m.300"]);
  });
});

describe("cuándo una orden pasa a ser tarea de un mecánico", () => {
  const odooCon = (orden: Record<string, unknown>) => ({
    read: vi.fn(async () => [{ id: 4366, vehicle_id: [7, "Kenton/GTR/409ABSM"], ...orden }]) as never,
    write: vi.fn(async () => true),
    messagePost: vi.fn(async () => 1),
  });

  it("al iniciar o mover la orden se devuelve el mecánico que tiene asignado", async () => {
    expect((await iniciarOrden(odooCon({ state: "new", vendor_id: [2009, "Diego"] }), 4366, "Jefe")).mecanicoPartnerId).toBe(2009);
    expect((await moverOrden(odooCon({ state: "new", vendor_id: false }), 4366, "new", "running", "Jefe")).mecanicoPartnerId).toBeNull();
  });

  it("al cambiar el mecánico se sabe si la orden está En proceso", async () => {
    const mecanico = { id: 2010, nombre: "Angel" };
    expect((await cambiarMecanico(odooCon({ state: "running", vendor_id: [2009, "Diego"] }), 4366, mecanico, "Jefe")).enProceso).toBe(true);
    expect((await cambiarMecanico(odooCon({ state: "cancelled", vendor_id: [2009, "Diego"] }), 4366, mecanico, "Jefe")).enProceso).toBe(false);
  });
});
