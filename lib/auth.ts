import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, gt } from "drizzle-orm";
import { getDb, schema } from "./db";
import { env } from "./env";
import { DURACION_SESION_DIAS, puede, type Accion } from "./permisos";
import { estaBloqueado, trasIntentoFallido } from "./pin";
import type { Rol } from "./db/schema";

export const COOKIE = "taller_sesion";

export type Usuario = { id: number; nombre: string; rol: Rol; odooPartnerId: number | null };

export class NoAutorizado extends Error {
  constructor(readonly status: 401 | 403) {
    super(status === 401 ? "Tenés que ingresar de nuevo" : "No tenés permiso para esto");
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).update(env().SESSION_SECRET).digest("hex");
}

export function hashPin(pin: string): Promise<string> {
  return hash(pin);
}

export type ResultadoLogin = { ok: true; usuario: Usuario } | { ok: false; error: string; status: number };

export async function login(usuarioId: number, pin: string): Promise<ResultadoLogin> {
  const db = await getDb();
  const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, usuarioId));
  if (!u || !u.activo) return { ok: false, error: "Usuario no encontrado", status: 401 };
  const ahora = new Date();
  if (estaBloqueado(u, ahora)) {
    const min = Math.ceil((u.bloqueadoHasta!.getTime() - ahora.getTime()) / 60_000);
    return { ok: false, error: `Demasiados intentos. Probá de nuevo en ${min} min.`, status: 429 };
  }
  if (!(await verify(u.pinHash, pin))) {
    const sig = trasIntentoFallido(u, ahora);
    await db.update(schema.usuarios).set(sig).where(eq(schema.usuarios.id, u.id));
    return sig.bloqueadoHasta
      ? { ok: false, error: "Demasiados intentos. Probá de nuevo en 15 min.", status: 429 }
      : { ok: false, error: "PIN incorrecto", status: 401 };
  }
  await db.update(schema.usuarios).set({ intentosFallidos: 0, bloqueadoHasta: null }).where(eq(schema.usuarios.id, u.id));

  const token = randomBytes(32).toString("base64url");
  const dias = DURACION_SESION_DIAS[u.rol];
  const expira = new Date(ahora.getTime() + dias * 86_400_000);
  await db.insert(schema.sesiones).values({
    id: hashToken(token),
    usuarioId: u.id,
    expira,
    userAgent: (await headers()).get("user-agent")?.slice(0, 200) ?? null,
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: env().COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    expires: expira,
  });
  await registrar(u.id, "login");
  return { ok: true, usuario: { id: u.id, nombre: u.nombre, rol: u.rol, odooPartnerId: u.odooPartnerId } };
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

export async function usuarioActual(): Promise<Usuario | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [fila] = await db
    .select({
      id: schema.usuarios.id,
      nombre: schema.usuarios.nombre,
      rol: schema.usuarios.rol,
      odooPartnerId: schema.usuarios.odooPartnerId,
      activo: schema.usuarios.activo,
    })
    .from(schema.sesiones)
    .innerJoin(schema.usuarios, eq(schema.sesiones.usuarioId, schema.usuarios.id))
    .where(and(eq(schema.sesiones.id, hashToken(token)), gt(schema.sesiones.expira, new Date())));
  if (!fila || !fila.activo) return null;
  return { id: fila.id, nombre: fila.nombre, rol: fila.rol, odooPartnerId: fila.odooPartnerId };
}

// Para Route Handlers: tira NoAutorizado (401/403).
export async function exigir(accion: Accion): Promise<Usuario> {
  const u = await usuarioActual();
  if (!u) throw new NoAutorizado(401);
  if (!puede(u.rol, accion)) throw new NoAutorizado(403);
  return u;
}

// Para páginas: redirige en vez de tirar.
export async function exigirPagina(accion: Accion): Promise<Usuario> {
  const u = await usuarioActual();
  if (!u) redirect("/ingresar");
  if (!puede(u.rol, accion)) redirect("/ordenes");
  return u;
}

export async function registrar(
  usuarioId: number | null,
  accion: string,
  extra: { ordenId?: number; vehiculoId?: number; detalle?: Record<string, unknown> } = {},
): Promise<void> {
  const db = await getDb();
  await db.insert(schema.logAcciones).values({ usuarioId, accion, ...extra });
}
