import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, gt, ne } from "drizzle-orm";
import { getDb, schema } from "./db";
import { URL_ACCESO, env } from "./env";
import { DURACION_SESION_ACCESO_DIAS, DURACION_SESION_DIAS, inicioDe, puedeAlguna, type Accion } from "./permisos";
import { estaBloqueado, ipBloqueada, registrarFalloIp, trasIntentoFallido, usuarioSchema } from "./credenciales";
import { quienHizo } from "./webhook-cobranzas";
import { MIN_SECRETO, marcarUsada, verificarEnlace, type MotivoRechazo } from "./acceso-dominio";
import { RUTA_HEADER, destinoDeVuelta, enlaceIrATaller, idSesionAcceso } from "./acceso-destino";
import type { Rol, Tema } from "./db/schema";

export const COOKIE = "taller_sesion";

export type Usuario = { id: number; usuario: string; nombre: string; rol: Rol; odooPartnerId: number | null; permisosOff: string[]; tema: Tema };

export class NoAutorizado extends Error {
  constructor(readonly status: 401 | 403, mensaje?: string) {
    super(mensaje ?? (status === 401 ? "Tenés que ingresar de nuevo" : "No tenés permiso para esto"));
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).update(env().SESSION_SECRET).digest("hex");
}

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export type ResultadoLogin = { ok: true; usuario: Usuario } | { ok: false; error: string; status: number; acceso?: string };

// ---------- Ridder Acceso como único ingreso (ACCESO_SOLO, etapa 2) ----------
// URL de Acceso sin barra final si el interruptor está prendido; null si está apagado (todo sigue como antes).
// errorDeEntorno (lib/env.ts) no deja arrancar con el interruptor prendido y ACCESO_URL o ACCESO_SECRET inválidos.
export function accesoSolo(): string | null {
  const e = env();
  if (!e.ACCESO_SOLO) return null;
  return URL_ACCESO.test(e.ACCESO_URL) && e.ACCESO_SECRET.length >= MIN_SECRETO ? e.ACCESO_URL.replace(/\/+$/, "") : null;
}

// Adónde va quien pide una página sin sesión: a Acceso con la ruta de vuelta (la pone proxy.ts), o al login propio.
export async function adondeSinSesion(): Promise<string> {
  const ruta = (await headers()).get(RUTA_HEADER);
  const acceso = accesoSolo();
  return acceso ? enlaceIrATaller(acceso, ruta) : "/ingresar";
}

// Adónde va el navegador después de borrar la sesión local: con el interruptor, a cerrar también Acceso.
export function destinoAlSalir(): string {
  const acceso = accesoSolo();
  return acceso ? `${acceso}/salir` : "/ingresar";
}

const INCORRECTO = "Usuario o contraseña incorrectos";
const DEMASIADOS = "Demasiados intentos. Probá de nuevo en unos minutos.";

async function ipCliente(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function login(usuario: string, password: string): Promise<ResultadoLogin> {
  const ip = await ipCliente();
  if (ipBloqueada(ip)) return { ok: false, error: DEMASIADOS, status: 429 };
  const db = await getDb();
  const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, usuario));
  if (!u || !u.activo) {
    registrarFalloIp(ip);
    return { ok: false, error: INCORRECTO, status: 401 };
  }
  const ahora = new Date();
  if (estaBloqueado(u, ahora)) return { ok: false, error: DEMASIADOS, status: 429 };
  if (!(await verify(u.passwordHash, password))) {
    registrarFalloIp(ip);
    const sig = trasIntentoFallido(u, ahora);
    await db.update(schema.usuarios).set(sig).where(eq(schema.usuarios.id, u.id));
    return sig.bloqueadoHasta ? { ok: false, error: DEMASIADOS, status: 429 } : { ok: false, error: INCORRECTO, status: 401 };
  }
  await db.update(schema.usuarios).set({ intentosFallidos: 0, bloqueadoHasta: null }).where(eq(schema.usuarios.id, u.id));

  // Con ACCESO_SOLO el login propio es la entrada de emergencia de los admins: los demás ingresan por Ridder.
  // Se mira después de la contraseña para no contarle a cualquiera qué rol tiene un usuario.
  const acceso = accesoSolo();
  if (acceso && u.rol !== "admin") return { ok: false, error: "Ingresá por Ridder", status: 403, acceso: `${acceso}/` };

  await abrirSesion(u, ahora);
  await registrar(u.id, "login");
  return { ok: true, usuario: { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, odooPartnerId: u.odooPartnerId, permisosOff: u.permisosOff, tema: u.tema } };
}

// La sesión de siempre: una fila en sesiones y la cookie, con la duración del rol.
// Desde Ridder Acceso con ACCESO_SOLO: 14 días para todos y el id público de la sesión de Acceso (para cerrarla al salir).
async function abrirSesion(u: { id: number; rol: Rol }, ahora: Date, desdeAcceso?: { dias: number; sesion: string | null }): Promise<void> {
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  const expira = new Date(ahora.getTime() + (desdeAcceso?.dias ?? DURACION_SESION_DIAS[u.rol]) * 86_400_000);
  await db.insert(schema.sesiones).values({
    id: hashToken(token),
    usuarioId: u.id,
    expira,
    ...(desdeAcceso?.sesion ? { accesoSesion: desdeAcceso.sesion } : {}),
    userAgent: (await headers()).get("user-agent")?.slice(0, 200) ?? null,
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: env().COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    expires: expira,
  });
}

// ---------- entrada desde Ridder Acceso ----------
// Quien ya ingresó en app.ridder.com.py llega con un enlace firmado de un solo uso (lib/acceso-dominio.ts) y entra
// sin contraseña, con la misma sesión que da el login. No crea usuarios ni cambia permisos: el usuario tiene que existir acá.
export type ResultadoAcceso = { ok: true; destino: string } | { ok: false; motivo: MotivoRechazo };

// Con ACCESO_SOLO llegan dos parámetros más, sin firmar: `a` (ruta de vuelta, se valida con la regla de Acceso) y `s`
// (id público de la sesión de Acceso, se guarda en la sesión para que Acceso la cierre al salir). Apagado, se ignoran.
export async function entrarConAcceso(t: string | null, extra: { a?: string | null; s?: string | null } = {}): Promise<ResultadoAcceso> {
  const secreto = env().ACCESO_SECRET;
  if (secreto.length < MIN_SECRETO) return { ok: false, motivo: "apagado" };
  const ip = await ipCliente();
  if (ipBloqueada(ip)) return { ok: false, motivo: "demasiados" };
  const rechazar = (motivo: MotivoRechazo): ResultadoAcceso => {
    registrarFalloIp(ip);
    return { ok: false, motivo };
  };
  const enlace = verificarEnlace(t, secreto);
  if (!enlace.ok) return rechazar(enlace.motivo);
  if (!marcarUsada(enlace.firma, enlace.vence)) return rechazar("usado");

  const db = await getDb();
  const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, enlace.usuario));
  if (!u || !u.activo) return rechazar("sin_usuario");
  const ahora = new Date();
  if (estaBloqueado(u, ahora)) return { ok: false, motivo: "bloqueado" };

  // El destino se decide antes de abrir la sesión: si `a` no sirve, al inicio del rol.
  const solo = !!accesoSolo();
  const destino = (solo && destinoDeVuelta(extra.a)) || inicioDe({ rol: u.rol, permisosOff: u.permisosOff ?? [] });
  const sesion = solo ? idSesionAcceso(extra.s) : null;

  // Si en este navegador había otra sesión (de otro usuario, por ejemplo), se cierra: queda solo la nueva.
  await logout();
  await abrirSesion(u, ahora, solo ? { dias: DURACION_SESION_ACCESO_DIAS, sesion } : undefined);
  await registrar(u.id, "login.acceso", { detalle: { origen: "acceso", ...(solo ? { sesionAcceso: !!sesion } : {}) } });
  return { ok: true, destino };
}

export async function cambiarPassword(usuarioId: number, actual: string, nueva: string): Promise<string | null> {
  const db = await getDb();
  const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, usuarioId));
  if (!u || !(await verify(u.passwordHash, actual))) return "La contraseña actual no coincide";
  await db.update(schema.usuarios).set({ passwordHash: await hashPassword(nueva) }).where(eq(schema.usuarios.id, usuarioId));
  const token = (await cookies()).get(COOKIE)?.value;
  await db
    .delete(schema.sesiones)
    .where(and(eq(schema.sesiones.usuarioId, usuarioId), ne(schema.sesiones.id, token ? hashToken(token) : "")));
  await registrar(usuarioId, "usuario.cambiar_password");
  return null;
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(schema.sesiones).where(eq(schema.sesiones.id, hashToken(token)));
  }
  jar.delete(COOKIE);
}

// ---------- llamadas de Cobranzas ----------
// Servidor a servidor: "Authorization: Bearer <API_COBRANZAS_SECRET>" y "X-Ridder-Usuario: <login>".
// La llamada actúa como ese usuario del taller, con su rol y sus permisos, igual que desde la web.
// "automatico" (procesos sin persona) es un jefe de solo lectura: todo lo que escribe está apagado.
const ESCRITURA_OFF = ["finalizar", "crear", "mover_tablero", "repuestos", "aprobar", "registrar_devoluciones", "crear_productos", "editar_precios", "cargar_compras"];
const AUTOMATICO: Usuario = { id: 0, usuario: "automatico", nombre: "Cobranzas (automático)", rol: "jefe", odooPartnerId: null, permisosOff: ESCRITURA_OFF, tema: "claro" };

const resumen = (v: string) => createHash("sha256").update(v).digest();

// null: no es una llamada de Cobranzas (o el secreto no coincide: sigue como cualquier request sin sesión).
// headers() va primero: marca la página como dinámica antes de leer el entorno (en el build no hay variables).
export const llamadaCobranzas = cache(async (): Promise<{ por: string } | null> => {
  const h = await headers();
  const auth = h.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const secreto = env().API_COBRANZAS_SECRET;
  if (!secreto) return null;
  if (!timingSafeEqual(resumen(auth.slice(7).trim()), resumen(secreto))) return null;
  return { por: quienHizo(h.get("x-ridder-usuario")) };
});

async function usuarioDeCobranzas(por: string): Promise<Usuario> {
  if (por === "automatico") return AUTOMATICO;
  const login = usuarioSchema.safeParse(por);
  const db = await getDb();
  const [u] = login.success ? await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, login.data)) : [];
  if (!u || !u.activo) throw new NoAutorizado(403, `«${por}» no es un usuario activo del taller`);
  return { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, odooPartnerId: u.odooPartnerId, permisosOff: u.permisosOff ?? [], tema: u.tema };
}

// cache: el layout raíz (tema) y cada página lo piden en el mismo request; una sola consulta.
export const usuarioActual = cache(async (): Promise<Usuario | null> => {
  const cobranzas = await llamadaCobranzas();
  if (cobranzas) return usuarioDeCobranzas(cobranzas.por);
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [fila] = await db
    .select({
      id: schema.usuarios.id,
      usuario: schema.usuarios.usuario,
      nombre: schema.usuarios.nombre,
      rol: schema.usuarios.rol,
      odooPartnerId: schema.usuarios.odooPartnerId,
      permisosOff: schema.usuarios.permisosOff,
      activo: schema.usuarios.activo,
      tema: schema.usuarios.tema,
    })
    .from(schema.sesiones)
    .innerJoin(schema.usuarios, eq(schema.sesiones.usuarioId, schema.usuarios.id))
    .where(and(eq(schema.sesiones.id, hashToken(token)), gt(schema.sesiones.expira, new Date())));
  if (!fila || !fila.activo) return null;
  return { id: fila.id, usuario: fila.usuario, nombre: fila.nombre, rol: fila.rol, odooPartnerId: fila.odooPartnerId, permisosOff: fila.permisosOff ?? [], tema: fila.tema };
});

// Para Route Handlers: tira NoAutorizado (401/403).
// Con varias acciones alcanza con tener alguna.
export async function exigir(accion: Accion | Accion[]): Promise<Usuario> {
  const u = await usuarioActual();
  if (!u) throw new NoAutorizado(401);
  if (!puedeAlguna(u, ([] as Accion[]).concat(accion))) throw new NoAutorizado(403);
  return u;
}

// Para páginas: redirige en vez de tirar.
export async function exigirPagina(accion: Accion | Accion[]): Promise<Usuario> {
  const u = await usuarioActual();
  if (!u) redirect(await adondeSinSesion());
  if (!puedeAlguna(u, ([] as Accion[]).concat(accion))) redirect(inicioDe(u));
  return u;
}

export async function registrar(
  usuarioId: number | null,
  accion: string,
  extra: { ordenId?: number; vehiculoId?: number; detalle?: Record<string, unknown> } = {},
): Promise<void> {
  const db = await getDb();
  // Lo que llega desde Cobranzas queda marcado con quién lo hizo allá.
  const cobranzas = await llamadaCobranzas().catch(() => null);
  const detalle = cobranzas ? { ...extra.detalle, origen: "cobranzas", por: cobranzas.por } : extra.detalle;
  await db.insert(schema.logAcciones).values({ usuarioId: usuarioId || null, accion, ...extra, detalle });
}
