import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { env } from "./env";
import { NoAutorizado, type Usuario } from "./auth";
import { usuarioSchema } from "./credenciales";
import { MIN_SECRETO, verificarFicha } from "./acceso-dominio";
import { usuarioDeTokenDePrueba } from "./movil-dominio";

const SIN_CREDENCIAL = "Tenés que ingresar de nuevo";

/**
 * Login de Taller de quien manda el pedido, o null. Dos formas, en este orden:
 *
 * 1. Ficha de Ridder Acceso (ridder-app/contratos/ACCESO-MOVIL.md 3.5), solo con MOVIL_FICHA_ACCESO=true:
 *    "Bearer <base64url(usuario)>.<vence en ms>.<firma>", firma = HMAC-SHA256(ACCESO_SECRET, "movil|<usuario>|<vence>")
 *    en hex, 10 minutos de vida, varios usos. Formato confirmado con la sesión de Acceso; Acceso todavía no la emite
 *    y Sebastián no revisó la propuesta, por eso está apagada por defecto.
 * 2. Token de prueba, solo fuera de producción: "Bearer <usuario>.<MOVIL_PRUEBA_TOKEN>".
 */
export function loginDeDispositivo(authorization: string | null, ahora = Date.now()): string | null {
  const e = env();
  const valor = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
  if (!valor) return null;
  if (e.MOVIL_FICHA_ACCESO && e.ACCESO_SECRET.length >= MIN_SECRETO) {
    const ficha = verificarFicha(valor, e.ACCESO_SECRET, ahora);
    if (ficha.ok) return ficha.usuario;
  }
  return usuarioDeTokenDePrueba(authorization, e.MOVIL_PRUEBA_TOKEN, process.env.NODE_ENV === "production");
}

/**
 * La persona que manda el pedido desde Ridder App. ÚNICO punto de autenticación de /api/movil/*.
 * Sin MOVIL_FICHA_ACCESO, en producción rechaza todo con 401.
 */
export async function personaDeDispositivo(req: Request): Promise<Usuario> {
  const login = loginDeDispositivo(req.headers.get("authorization"));
  if (!login) throw new NoAutorizado(401, SIN_CREDENCIAL);
  const valido = usuarioSchema.safeParse(login);
  if (!valido.success) throw new NoAutorizado(401, SIN_CREDENCIAL);
  const db = await getDb();
  const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, valido.data));
  if (!u || !u.activo) throw new NoAutorizado(401, SIN_CREDENCIAL);
  return { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, odooPartnerId: u.odooPartnerId, permisosOff: u.permisosOff ?? [], tema: u.tema };
}
