import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { getDb, schema } from "./db";
import { env } from "./env";
import { hashPassword, registrar } from "./auth";
import { ipBloqueada, registrarFalloIp } from "./credenciales";
import { ErrorUsuario, UsuarioNoEncontrado, contactoParaRol } from "./usuarios";
import { quienHizo } from "./webhook-cobranzas";
import { MIN_SECRETO } from "./acceso-dominio";
import { cambiosDe, cierraSesiones, dejaSinAdmin, faltaContactoMecanico, type DatosAcceso } from "./acceso-api-dominio";

export class AccesoApagado extends Error {}
export class AccesoNoAutorizado extends Error {}
export class AccesoDemasiados extends Error {}
export class AccesoConflicto extends Error {}

const resumen = (v: string) => createHash("sha256").update(v).digest();

// "Authorization: Bearer <ACCESO_API_SECRET>" y "X-Ridder-Usuario" con el admin que hizo el cambio en Acceso.
// La clave es propia de esta API: si es corta o es la misma que otra del entorno, la API queda apagada (503).
export function autorizarAcceso(req: Request): { origen: "acceso"; por: string } {
  const e = env();
  const secreto = e.ACCESO_API_SECRET;
  if (secreto.length < MIN_SECRETO) throw new AccesoApagado("La API de Ridder Acceso no está configurada");
  if ([e.ACCESO_SECRET, e.WEBHOOK_USUARIOS_SECRET, e.API_COBRANZAS_SECRET, e.SESSION_SECRET].includes(secreto)) {
    console.error("[acceso] ACCESO_API_SECRET repite otra clave del entorno: la API queda apagada");
    throw new AccesoApagado("La API de Ridder Acceso no está configurada");
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  if (ipBloqueada(ip)) throw new AccesoDemasiados("Demasiados intentos. Probá de nuevo en unos minutos.");
  const recibido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!timingSafeEqual(resumen(recibido), resumen(secreto))) {
    registrarFalloIp(ip);
    throw new AccesoNoAutorizado("No autorizado");
  }
  return { origen: "acceso", por: quienHizo(req.headers.get("x-ridder-usuario")) };
}

type Origen = ReturnType<typeof autorizarAcceso>;
type Estado = { usuario: string; nombre: string; rol: schema.Rol; activo: boolean; odooPartnerId: number | null };
export type ResultadoAcceso = { ok: true; creado: boolean; usuario: Estado; aviso?: string };

const estadoDe = (u: typeof schema.usuarios.$inferSelect): Estado => ({ usuario: u.usuario, nombre: u.nombre, rol: u.rol, activo: u.activo, odooPartnerId: u.odooPartnerId });

export async function estadoParaAcceso(usuario: string): Promise<{ ok: true; usuario: Estado }> {
  const db = await getDb();
  const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, usuario));
  if (!u) throw new UsuarioNoEncontrado("Ese usuario no existe en Taller");
  return { ok: true, usuario: estadoDe(u) };
}

// El contacto de Odoo que manda Acceso tiene que servir para el rol (etiqueta «mecanico» o «ejecutivo»).
// Para un mecánico es obligatorio: si no sirve o no se puede leer Odoo, no se guarda nada y Acceso reintenta.
// Para los demás roles el usuario se guarda igual, sin ese contacto, y la respuesta avisa por qué.
async function resolverContacto(id: number | null | undefined, rol: schema.Rol): Promise<{ contacto: { id: number; nombre: string } | null; aviso?: string }> {
  if (!id) return { contacto: null };
  if (rol === "mecanico") return { contacto: await contactoParaRol(id, rol) };
  try {
    return { contacto: await contactoParaRol(id, rol) };
  } catch (e) {
    return { contacto: null, aviso: `No se guardó el contacto de Odoo ${id}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function guardarDesdeAcceso(usuario: string, datos: DatosAcceso, o: Origen): Promise<ResultadoAcceso> {
  const db = await getDb();
  const [actual] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, usuario));

  if (!actual) {
    if (faltaContactoMecanico(datos.rol, datos.odooPartnerId)) throw new ErrorUsuario("Un mecánico necesita su contacto de Odoo (odooPartnerId)");
    const { contacto, aviso } = await resolverContacto(datos.odooPartnerId, datos.rol);
    const filas = await db
      .insert(schema.usuarios)
      .values({
        usuario,
        nombre: datos.nombre,
        rol: datos.rol,
        activo: datos.activo,
        // Nadie conoce esta contraseña: la persona entra por el enlace firmado de Ridder Acceso (/entrar/acceso).
        passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
        permisosOff: [],
        origen: "acceso",
        odooPartnerId: contacto?.id ?? null,
        odooPartnerNombre: contacto?.nombre ?? null,
      })
      .onConflictDoNothing()
      .returning();
    // Dos altas a la vez del mismo usuario: la segunda sigue como actualización.
    if (!filas.length) return guardarDesdeAcceso(usuario, datos, o);
    await registrar(null, "usuario.crear", { detalle: { usuario, nombre: datos.nombre, rol: datos.rol, activo: datos.activo, odooPartnerId: contacto?.id ?? null, ...o } });
    return { ok: true, creado: true, usuario: estadoDe(filas[0]), ...(aviso ? { aviso } : {}) };
  }

  const cambios = cambiosDe(actual, datos);
  if (faltaContactoMecanico(datos.rol, cambios.odooPartnerId ?? actual.odooPartnerId)) throw new ErrorUsuario("Un mecánico necesita su contacto de Odoo (odooPartnerId)");
  if (cambios.rol !== undefined || cambios.activo !== undefined) {
    const otros = await db.select({ id: schema.usuarios.id }).from(schema.usuarios).where(and(eq(schema.usuarios.rol, "admin"), eq(schema.usuarios.activo, true), ne(schema.usuarios.id, actual.id)));
    if (dejaSinAdmin(actual, datos, otros.length)) throw new AccesoConflicto("Es el único admin activo de Taller: no se puede desactivar ni cambiar de rol");
  }
  let aviso: string | undefined;
  let contactoNombre: string | null | undefined;
  if (cambios.odooPartnerId !== undefined) {
    const r = await resolverContacto(cambios.odooPartnerId, datos.rol);
    aviso = r.aviso;
    if (r.contacto) contactoNombre = r.contacto.nombre;
    else delete cambios.odooPartnerId;
  }
  if (!Object.keys(cambios).length) return { ok: true, creado: false, usuario: estadoDe(actual), ...(aviso ? { aviso } : {}) };

  const [nuevo] = await db
    .update(schema.usuarios)
    .set({ ...cambios, ...(cambios.odooPartnerId !== undefined ? { odooPartnerNombre: contactoNombre ?? null } : {}) })
    .where(eq(schema.usuarios.id, actual.id))
    .returning();
  if (cierraSesiones(cambios)) await db.delete(schema.sesiones).where(eq(schema.sesiones.usuarioId, actual.id));
  await registrar(null, "usuario.editar", { detalle: { usuario, ...cambios, ...o } });
  return { ok: true, creado: false, usuario: estadoDe(nuevo), ...(aviso ? { aviso } : {}) };
}

// Ridder Acceso cierra un teléfono (o la persona cambia su contraseña): se cierran TODAS las sesiones de Taller de ese
// usuario, también la de la computadora (vuelve a entrar por Acceso sin escribir nada). No lo desactiva ni toca nada
// más. CONTRATO.md de Ridder Acceso, sección 7.
export async function cerrarSesionesDesdeAcceso(usuario: string, o: Origen): Promise<{ ok: true; sesiones: number }> {
  const db = await getDb();
  const [u] = await db.select({ id: schema.usuarios.id }).from(schema.usuarios).where(eq(schema.usuarios.usuario, usuario));
  if (!u) throw new UsuarioNoEncontrado("Ese usuario no existe en Taller");
  const cerradas = await db.delete(schema.sesiones).where(eq(schema.sesiones.usuarioId, u.id)).returning({ id: schema.sesiones.id });
  await registrar(u.id, "usuario.cerrar_sesiones", { detalle: { usuario, sesiones: cerradas.length, motivo: "sesiones cerradas desde Ridder Acceso", ...o } });
  return { ok: true, sesiones: cerradas.length };
}

// Etapa 2 (CONTRATO.md de Acceso, 5.2 punto 5): la persona salió de Ridder Acceso; se cierran las sesiones de Taller
// que se abrieron desde esa sesión de Acceso (`s`, guardado al entrar por /entrar/acceso). 0 también es respuesta válida.
export async function cerrarSesionesDeAcceso(s: string, o: Origen): Promise<{ ok: true; sesiones: number }> {
  const db = await getDb();
  const cerradas = await db.delete(schema.sesiones).where(eq(schema.sesiones.accesoSesion, s)).returning({ usuarioId: schema.sesiones.usuarioId });
  if (cerradas.length) {
    const usuarios = [...new Set(cerradas.map((c) => c.usuarioId))];
    await registrar(usuarios.length === 1 ? usuarios[0] : null, "sesion.cerrar_acceso", { detalle: { sesionAcceso: s, sesiones: cerradas.length, motivo: "salió de Ridder Acceso", ...o } });
  }
  return { ok: true, sesiones: cerradas.length };
}
