import "server-only";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "./db";
import { env } from "./env";
import { odoo } from "./odoo";
import { hashPassword, registrar, type Usuario } from "./auth";
import { contactoPorNombre, datosUsuarioSchema, etiquetasDelRol, passwordSchema, textoEtiquetas, usuarioSchema } from "./credenciales";
import { limpiarPermisosOff } from "./permisos";
import type { Rol } from "./db/schema";

export type ContactoOdoo = { id: number; nombre: string };

// Contactos de Odoo por etiqueta: «mecanico» y «ejecutivo». Qué etiqueta va con cada rol: etiquetasDelRol.
const cacheContactos = new Map<number, { hasta: number; lista: ContactoOdoo[] }>();

async function contactosConEtiqueta(etiqueta: number, fresco = false): Promise<ContactoOdoo[]> {
  const c = cacheContactos.get(etiqueta);
  if (!fresco && c && c.hasta > Date.now()) return c.lista;
  const filas = await odoo.searchRead<{ id: number; name: string }>("res.partner", [["category_id", "in", [etiqueta]]], ["id", "name"], {
    limit: 200,
    order: "name asc",
  });
  const lista = filas.map((p) => ({ id: p.id, nombre: p.name.trim() }));
  cacheContactos.set(etiqueta, { hasta: Date.now() + 5 * 60_000, lista });
  return lista;
}

export const mecanicosOdoo = () => contactosConEtiqueta(env().ODOO_TAG_MECANICO);
export const ejecutivosOdoo = () => contactosConEtiqueta(env().ODOO_TAG_EJECUTIVO);

export class ErrorUsuario extends Error {}

// Los contactos válidos para un rol, según sus etiquetas.
async function contactosDelRol(rol: Rol, fresco = false): Promise<ContactoOdoo[]> {
  const ids = { mecanico: env().ODOO_TAG_MECANICO, ejecutivo: env().ODOO_TAG_EJECUTIVO };
  return (await Promise.all(etiquetasDelRol(rol).map((e) => contactosConEtiqueta(ids[e], fresco)))).flat();
}

async function nombreContacto(id: number | null, rol: Rol): Promise<string | null> {
  if (!id) return null;
  const etiquetas = etiquetasDelRol(rol);
  const c = (await contactosDelRol(rol, true)).find((m) => m.id === id);
  if (!c) throw new ErrorUsuario(`Ese contacto no tiene la etiqueta ${textoEtiquetas(etiquetas)} en Odoo`);
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
      permisosOff: schema.usuarios.permisosOff,
    })
    .from(schema.usuarios)
    .orderBy(asc(schema.usuarios.activo), asc(schema.usuarios.nombre));
}

export type UsuarioAdmin = Awaited<ReturnType<typeof listarUsuarios>>[number];

export async function crearUsuario(datos: z.infer<typeof crearSchema>, autor: Usuario): Promise<number> {
  exigirContactoSiMecanico(datos);
  const db = await getDb();
  const odooPartnerNombre = await nombreContacto(datos.odooPartnerId, datos.rol);
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
      permisosOff: limpiarPermisosOff(datos.rol, datos.permisosOff),
    })
    .onConflictDoNothing()
    .returning({ id: schema.usuarios.id });
  if (!filas.length) throw new ErrorUsuario("Ese usuario ya existe");
  await registrar(autor.id, "usuario.crear", {
    detalle: { usuario: datos.usuario, rol: datos.rol, odooPartnerId: datos.odooPartnerId, permisosOff: limpiarPermisosOff(datos.rol, datos.permisosOff) },
  });
  return filas[0].id;
}

// ---------- API de Cobranzas ----------
// Alta que llega desde Cobranzas: mismo usuario y contraseña, rol cobrador, origen "cobranzas".
// Si el usuario ya existe no se toca (puede ser otra persona con el mismo nombre de usuario).
// Cambiar contraseña o activar/desactivar solo vale para cuentas con origen "cobranzas".
export const altaCobranzasSchema = z.object({ usuario: usuarioSchema, nombre: z.string().trim().min(2).max(80), password: passwordSchema });
export const cambioCobranzasSchema = z
  .object({ password: passwordSchema.optional(), activo: z.boolean().optional() })
  .refine((d) => d.password !== undefined || d.activo !== undefined, "Mandá password o activo");

export class UsuarioNoEncontrado extends Error {}
export class UsuarioAjeno extends Error {}

type Origen = { origen: "cobranzas"; por: string };

type Contacto = { id: number; nombre: string } | null;
type ResultadoContacto = { contacto: Contacto; motivoContacto?: string };

// El contacto «ejecutivo» con el mismo nombre. Si Odoo no responde, el alta sigue sin contacto.
async function buscarContactoCobrador(nombre: string): Promise<ResultadoContacto> {
  try {
    const r = contactoPorNombre(nombre, await contactosDelRol("cobrador", true));
    return r.contacto ? { contacto: r.contacto } : { contacto: null, motivoContacto: r.motivo };
  } catch (e) {
    return { contacto: null, motivoContacto: `no se pudo leer Odoo: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function crearCobradorDesdeCobranzas(
  datos: z.infer<typeof altaCobranzasSchema>,
  o: Origen,
): Promise<{ id: number; creado: boolean } & ResultadoContacto> {
  const db = await getDb();
  const [actual] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, datos.usuario));
  if (actual) {
    const ya: Contacto = actual.odooPartnerId ? { id: actual.odooPartnerId, nombre: actual.odooPartnerNombre ?? `#${actual.odooPartnerId}` } : null;
    // Una cuenta de Cobranzas que quedó sin contacto se completa al volver a llamar; las del taller no se tocan.
    if (ya || actual.origen !== "cobranzas") return { id: actual.id, creado: false, contacto: ya };
    const r = await buscarContactoCobrador(actual.nombre);
    if (r.contacto) {
      await db
        .update(schema.usuarios)
        .set({ odooPartnerId: r.contacto.id, odooPartnerNombre: r.contacto.nombre })
        .where(eq(schema.usuarios.id, actual.id));
      await registrar(null, "usuario.editar", { detalle: { usuario: actual.usuario, odooPartnerId: r.contacto.id, ...o } });
    }
    return { id: actual.id, creado: false, ...r };
  }

  const r = await buscarContactoCobrador(datos.nombre);
  const filas = await db
    .insert(schema.usuarios)
    .values({
      usuario: datos.usuario,
      nombre: datos.nombre,
      rol: "cobrador",
      passwordHash: await hashPassword(datos.password),
      permisosOff: [],
      origen: "cobranzas",
      odooPartnerId: r.contacto?.id ?? null,
      odooPartnerNombre: r.contacto?.nombre ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: schema.usuarios.id });
  // Dos altas a la vez del mismo usuario: la segunda responde como "ya existía".
  if (!filas.length) return crearCobradorDesdeCobranzas(datos, o);
  await registrar(null, "usuario.crear", { detalle: { usuario: datos.usuario, rol: "cobrador", odooPartnerId: r.contacto?.id ?? null, ...o } });
  return { id: filas[0].id, creado: true, ...r };
}

export async function estadoUsuario(usuario: string) {
  const db = await getDb();
  const [u] = await db
    .select({
      id: schema.usuarios.id,
      rol: schema.usuarios.rol,
      activo: schema.usuarios.activo,
      origen: schema.usuarios.origen,
      odooPartnerId: schema.usuarios.odooPartnerId,
      odooPartnerNombre: schema.usuarios.odooPartnerNombre,
    })
    .from(schema.usuarios)
    .where(eq(schema.usuarios.usuario, usuario));
  if (!u) throw new UsuarioNoEncontrado("Ese usuario no existe");
  const { odooPartnerId, odooPartnerNombre, ...resto } = u;
  return { existe: true, ...resto, contacto: odooPartnerId ? { id: odooPartnerId, nombre: odooPartnerNombre ?? `#${odooPartnerId}` } : null };
}

export async function cambiarDesdeCobranzas(usuario: string, datos: z.infer<typeof cambioCobranzasSchema>, o: Origen) {
  const db = await getDb();
  const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, usuario));
  if (!u) throw new UsuarioNoEncontrado("Ese usuario no existe");
  if (u.origen !== "cobranzas") throw new UsuarioAjeno("Esa cuenta no se creó desde Cobranzas: se maneja desde Usuarios del taller");
  await db
    .update(schema.usuarios)
    .set({
      ...(datos.activo !== undefined ? { activo: datos.activo } : {}),
      ...(datos.password ? { passwordHash: await hashPassword(datos.password), intentosFallidos: 0, bloqueadoHasta: null } : {}),
    })
    .where(eq(schema.usuarios.id, u.id));
  // Igual que desde Usuarios: cambiar la contraseña o desactivar cierra sus sesiones.
  if (datos.password || datos.activo === false) await db.delete(schema.sesiones).where(eq(schema.sesiones.usuarioId, u.id));
  await registrar(null, "usuario.editar", {
    detalle: { usuario, ...(datos.activo !== undefined ? { activo: datos.activo } : {}), cambioPassword: Boolean(datos.password), ...o },
  });
  return { id: u.id, rol: u.rol, activo: datos.activo ?? u.activo };
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
    datos.odooPartnerId === actual.odooPartnerId && datos.rol === actual.rol
      ? actual.odooPartnerNombre
      : await nombreContacto(datos.odooPartnerId, datos.rol);
  await db
    .update(schema.usuarios)
    .set({
      nombre: datos.nombre,
      rol: datos.rol,
      activo: datos.activo,
      odooPartnerId: datos.odooPartnerId,
      odooPartnerNombre,
      permisosOff: limpiarPermisosOff(datos.rol, datos.permisosOff),
      ...(datos.password ? { passwordHash: await hashPassword(datos.password), intentosFallidos: 0, bloqueadoHasta: null } : {}),
    })
    .where(eq(schema.usuarios.id, id));
  if (datos.password || !datos.activo || datos.rol !== actual.rol) {
    await db.delete(schema.sesiones).where(eq(schema.sesiones.usuarioId, id));
  }
  await registrar(autor.id, "usuario.editar", {
    detalle: {
      usuario: actual.usuario,
      rol: datos.rol,
      activo: datos.activo,
      odooPartnerId: datos.odooPartnerId,
      permisosOff: limpiarPermisosOff(datos.rol, datos.permisosOff),
      cambioPassword: Boolean(datos.password),
    },
  });
}
