// Registro de cambios de un producto: el servicio real y la base PGlite con las migraciones; Odoo es un doble.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "taller-registro-"));
Object.assign(process.env, {
  DATABASE_URL: `pglite://${dir}`,
  SESSION_SECRET: "x".repeat(40),
  ODOO_URL: "http://odoo.invalid",
  ODOO_DB: "prueba",
  ODOO_USER: "api",
  ODOO_API_KEY: "clave",
});

const producto = { id: 46, name: "Foco H4 - Narva", display_name: "Foco H4 - Narva", list_price: 20000, product_tmpl_id: [45, "Foco"] as [number, string] };
const notas: string[] = [];
vi.mock("@/lib/odoo", () => ({
  OdooError: class extends Error {},
  odoo: {
    async searchRead(_m: string, dominio: unknown[]) {
      const d = JSON.stringify(dominio);
      if (d.includes("=ilike")) return [];
      if (d.includes('"product_tmpl_id","="')) return [{ id: 46 }, { id: 146 }];
      return [{ ...producto }];
    },
    async read() {
      return [{ name: producto.name }];
    },
    async write(_m: string, _ids: number[], vals: { name?: string; list_price?: number }) {
      if (vals.name) producto.name = producto.display_name = vals.name;
      if (vals.list_price !== undefined) producto.list_price = vals.list_price;
      return true;
    },
    async messagePost(_m: string, _id: number, p: { body: string }) {
      notas.push(p.body);
      return 1;
    },
  },
}));

import { sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { cambiarNombreComo, cambiarPrecioComo } from "@/lib/producto-servicio";
import { cambiosDe, objetoProducto } from "@/lib/registro-cambios";
import type { Usuario } from "@/lib/auth";

let jefe: Usuario;

beforeAll(async () => {
  const db = await getDb();
  const [u] = await db.insert(schema.usuarios).values({ usuario: "derlis", nombre: "Derlis", rol: "jefe", passwordHash: "x" }).returning();
  jefe = { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: "jefe", odooPartnerId: null, permisosOff: [], tema: "claro" } as Usuario;
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("registro de cambios de un producto", () => {
  it("el cambio de nombre queda con quién, cuándo, antes y después", async () => {
    const antes = Date.now();
    const r = await cambiarNombreComo(46, "Foco H4 Narva 12V", jefe);
    expect(r).toMatchObject({ anterior: "Foco H4 - Narva", nuevo: "Foco H4 Narva 12V", cambio: true, aviso: null });
    const [c] = await cambiosDe(objetoProducto(46));
    expect(c).toMatchObject({ titulo: "Nombre cambiado", autor: "Derlis", campos: [{ campo: "Nombre", antes: "Foco H4 - Narva", despues: "Foco H4 Narva 12V" }] });
    expect(c.fecha.getTime()).toBeGreaterThanOrEqual(antes - 1000);
    expect(notas.at(-1)).toContain("Derlis cambió el nombre del producto");
  });

  it("el cambio de nombre queda también en la otra variante del mismo producto", async () => {
    expect(await cambiosDe(objetoProducto(146))).toMatchObject([{ titulo: "Nombre cambiado", campos: [{ campo: "Nombre", despues: "Foco H4 Narva 12V" }] }]);
  });

  it("guardar el mismo nombre no agrega renglones", async () => {
    const cuantos = (await cambiosDe(objetoProducto(46))).length;
    expect((await cambiarNombreComo(46, "Foco H4 Narva 12V", jefe)).cambio).toBe(false);
    expect(await cambiosDe(objetoProducto(46))).toHaveLength(cuantos);
  });

  it("el cambio de precio aparece en el mismo registro, lo más nuevo primero", async () => {
    await cambiarPrecioComo(46, 25000, jefe);
    const cambios = await cambiosDe(objetoProducto(46));
    expect(cambios.map((c) => c.titulo)).toEqual(["Precio de venta cambiado", "Nombre cambiado"]);
    expect(cambios[0].campos).toEqual([{ campo: "Precio de venta", antes: 20000, despues: 25000 }]);
  });

  it("el nombre de quien lo hizo queda copiado: no cambia si después renombran al usuario", async () => {
    const db = await getDb();
    await db.update(schema.usuarios).set({ nombre: "Otro nombre" });
    expect((await cambiosDe(objetoProducto(46)))[0].autor).toBe("Derlis");
  });

  it("no mezcla productos", async () => {
    expect(await cambiosDe(objetoProducto(47))).toEqual([]);
  });

  it("la migración pasa al registro lo que ya estaba anotado de productos", async () => {
    const db = await getDb();
    await db.insert(schema.logAcciones).values([
      { usuarioId: jefe.id, accion: "producto.precio", detalle: { productoId: 80, anterior: 1000, nuevo: 1500, aviso: null } },
      { usuarioId: jefe.id, accion: "producto.crear", detalle: { productoId: 80, nombre: "Bujía", costo: 500, precio: 1000 } },
    ]);
    const archivo = fs.readFileSync(path.join(process.cwd(), "drizzle/0010_registro_cambios.sql"), "utf8");
    const sentencias = archivo.split("--> statement-breakpoint").map((s) => s.trim()).filter((s) => s.replace(/^--.*\n/, "").startsWith("UPDATE"));
    expect(sentencias).toHaveLength(4);
    for (const s of sentencias) await db.execute(sql.raw(s));
    const cambios = await cambiosDe(objetoProducto(80));
    expect(cambios.map((c) => c.titulo)).toEqual(["Producto creado", "Precio de venta cambiado"]);
    expect(cambios[1].campos).toEqual([{ campo: "Precio de venta", antes: 1000, despues: 1500 }]);
    expect(cambios[0].campos.find((f) => f.campo === "Nombre")?.despues).toBe("Bujía");
    expect(cambios[0].autor).toBe("Otro nombre");
  });
});
