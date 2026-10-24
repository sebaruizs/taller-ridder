import "server-only";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "./db";
import { env } from "./env";
import { odoo } from "./odoo";
import { hashPassword, registrar, type Usuario } from "./auth";
import { datosUsuarioSchema, passwordSchema, usuarioSchema } from "./credenciales";

export type ContactoOdoo = { id: number; nombre: string };

let cacheMecanicos: { hasta: number; lista: ContactoOdoo[] } | undefined;

export async function mecanicosOdoo(): Promise<ContactoOdoo[]> {
  if (cacheMecanicos && cacheMecanicos.hasta > Date.now()) return cacheMecanicos.lista;
  const filas = await odoo.searchRead<{ id: number; name: string }>(
    "res.partner",
    [["category_id", "in", [env().ODOO_TAG_MECANICO]]],
    ["id", "name"],
    { limit: 200, order: "name asc" },
  );
  const lista = filas.map((p) => ({ id: p.id, nombre: p.name.trim() }));
  cacheMecanicos = { hasta: Date.now() + 5 * 60_000, lista };
  return lista;
}

export class ErrorUsuario extends Error {}

async function nombreContacto(id: number | null): Promise<string | null> {
  if (!id) return null;
  cacheMecanicos = undefined;
  const c = (await mecanicosOdoo()).find((m) => m.id === id);
  if (!c) throw new ErrorUsuario("Ese contacto no tiene la etiqueta «mecanico» en Odoo");
  return c.nombre;
}

export const crearSchema = datosUsuarioSchema.extend({ usuario: usuarioSchema, password: passwordSchema });
export const editarSchema = datosUsuarioSchema.extend({ password: passwordSchema.optional() });

function exigirContactoSiMecanico(d: { rol: string; odooPartnerId: number | null }) {
  if (d.rol === "mecanico" && !d.odooPartnerId) throw new ErrorUsuario("Elegí el contacto de Odoo del mecánico");
}

export async function listarUsuarios() {
  const db = await getDb();
  return db
    .select({
      id: schema.usuarios.id,
      usuario: schema.usuarios.usuario,
      nombre: schema.usuarios.nombre,
      rol: schema.usuarios.rol,
      odooPartnerId: schema.usuarios.odooPartnerId,
      odooPartnerNombre: schema.usuarios.odooPartnerNombre,
      activo: schema.usuarios.activo,
    })
    .from(schema.usuarios)
    .orderBy(asc(schema.usuarios.activo), asc(schema.usuarios.nombre));
}

export type UsuarioAdmin = Awaited<ReturnType<typeof listarUsuarios>>[number];

export async function crearUsuario(datos: z.infer<typeof crearSchema>, autor: Usuario): Promise<number> {
  exigirContactoSiMecanico(datos);
  const db = await getDb();
  const odooPartnerNombre = await nombreContacto(datos.odooPartnerId);
  const filas = await db
    .insert(schema.usuarios)
    .values({
      usuario: datos.usuario,
      nombre: datos.nombre,
      rol: datos.rol,
      activo: datos.activo,
      passwordHash: await hashPassword(datos.password),
      odooPartnerId: datos.odooPartnerId,
      odooPartnerNombre,
    })
    .onConflictDoNothing()
    .returning({ id: schema.usuarios.id });
  if (!filas.length) throw new ErrorUsuario("Ese usuario ya existe");
  await registrar(autor.id, "usuario.crear", { detalle: { usuario: datos.usuario, rol: datos.rol, odooPartnerId: datos.odooPartnerId } });
  return filas[0].id;
}

export async function editarUsuario(id: number, datos: z.infer<typeof editarSchema>, autor: Usuario): Promise<void> {
  exigirContactoSiMecanico(datos);
  if (id === autor.id && (datos.rol !== "admin" || !datos.activo)) {
    throw new ErrorUsuario("No podés quitarte el rol de admin ni desactivarte");
  }
  const db = await getDb();
  const [actual] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, id));
  if (!actual) throw new ErrorUsuario("Ese usuario no existe");
  const odooPartnerNombre =
    datos.odooPartnerId === actual.odooPartnerId ? actual.odooPartnerNombre : await nombreContacto(datos.odooPartnerId);
  await db
    .update(schema.usuarios)
    .set({
      nombre: datos.nombre,
      rol: datos.rol,
      activo: datos.activo,
      odooPartnerId: datos.odooPartnerId,
      odooPartnerNombre,
      ...(datos.password ? { passwordHash: await hashPassword(datos.password), intentosFallidos: 0, bloqueadoHasta: null } : {}),
    })
    .where(eq(schema.usuarios.id, id));
  if (datos.password || !datos.activo || datos.rol !== actual.rol) {
    await db.delete(schema.sesiones).where(eq(schema.sesiones.usuarioId, id));
  }
  await registrar(autor.id, "usuario.editar", {
    detalle: { usuario: actual.usuario, rol: datos.rol, activo: datos.activo, odooPartnerId: datos.odooPartnerId, cambioPassword: Boolean(datos.password) },
  });
}
