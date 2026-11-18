// POST /api/acceso/usuarios/<usuario>/cerrar-sesiones de punta a punta: la ruta real con una base PGlite temporal.
// Contrato: CONTRATO.md de Ridder Acceso, sección 7.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "taller-cerrar-"));
const CLAVE = "clave-de-la-api-de-usuarios-de-acceso-0123456789";
Object.assign(process.env, {
  DATABASE_URL: `pglite://${dir}`,
  SESSION_SECRET: "x".repeat(40),
  ODOO_URL: "http://odoo.invalid",
  ODOO_DB: "prueba",
  ODOO_USER: "api",
  ODOO_API_KEY: "clave",
  ACCESO_API_SECRET: CLAVE,
});

const { POST } = await import("@/app/api/acceso/usuarios/[usuario]/cerrar-sesiones/route");
const { getDb, schema } = await import("@/lib/db");
const { eq } = await import("drizzle-orm");

const cerrar = async (usuario: string, clave = CLAVE) => {
  const r = await POST(
    new Request(`http://t/api/acceso/usuarios/${usuario}/cerrar-sesiones`, {
      method: "POST",
      headers: { authorization: `Bearer ${clave}`, "x-ridder-usuario": "admin.acceso", "content-type": "application/json" },
      body: "{}",
    }),
    { params: Promise.resolve({ usuario }) } as never,
  );
  return { status: r.status, body: await r.json() };
};

let mariaId = 0;
let otroId = 0;
beforeAll(async () => {
  const db = await getDb();
  const filas = await db
    .insert(schema.usuarios)
    .values([
      { usuario: "maria.lopez", nombre: "María López", rol: "mecanico", passwordHash: "x", odooPartnerId: 1 },
      { usuario: "otro.usuario", nombre: "Otro", rol: "jefe", passwordHash: "x" },
    ])
    .returning();
  [mariaId, otroId] = filas.map((f) => f.id);
  const expira = new Date(Date.now() + 86_400_000);
  await db.insert(schema.sesiones).values([
    { id: "s1", usuarioId: mariaId, expira },
    { id: "s2", usuarioId: mariaId, expira },
    { id: "s3", usuarioId: otroId, expira },
  ]);
}, 60_000);
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("cerrar sesiones desde Ridder Acceso", () => {
  it("cierra todas las sesiones del usuario, no las de otros, y no lo desactiva", async () => {
    expect(await cerrar("maria.lopez")).toEqual({ status: 200, body: { ok: true, sesiones: 2 } });
    const db = await getDb();
    expect((await db.select().from(schema.sesiones)).map((s) => s.id)).toEqual(["s3"]);
    const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, mariaId));
    expect(u.activo).toBe(true);
  });

  it("sin sesiones abiertas también responde 200, con 0", async () => {
    expect(await cerrar("maria.lopez")).toEqual({ status: 200, body: { ok: true, sesiones: 0 } });
  });

  it("queda en la auditoría como cerradas desde Ridder Acceso, con quién lo pidió", async () => {
    const db = await getDb();
    const log = await db.select().from(schema.logAcciones).where(eq(schema.logAcciones.accion, "usuario.cerrar_sesiones"));
    expect(log[0]).toMatchObject({
      usuarioId: mariaId,
      detalle: { usuario: "maria.lopez", sesiones: 2, motivo: "sesiones cerradas desde Ridder Acceso", origen: "acceso", por: "admin.acceso" },
    });
  });

  it("usuario inexistente: 404 con error; clave incorrecta: 401", async () => {
    expect(await cerrar("no.existe")).toEqual({ status: 404, body: { error: "Ese usuario no existe en Taller" } });
    expect((await cerrar("maria.lopez", "otra-clave-cualquiera-de-treinta-y-dos-chars")).status).toBe(401);
  });
});
