import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { env } from "./env";
import { NoAutorizado, type Usuario } from "./auth";
import { usuarioSchema } from "./credenciales";
import { usuarioDeTokenDePrueba } from "./movil-dominio";

const SIN_CREDENCIAL = "Tenés que ingresar de nuevo";

/**
 * La persona que manda el pedido desde Ridder App. ÚNICO punto de autenticación de /api/movil/*.
 *
 * Hoy: Ridder Acceso todavía no emite la credencial de dispositivo (ridder-app/contratos/ACCESO-MOVIL.md), así que
 * en producción se rechaza todo con 401. En desarrollo (NODE_ENV distinto de production) se acepta
 * "Authorization: Bearer <usuario>.<MOVIL_PRUEBA_TOKEN>", para un usuario activo de Taller.
 *
 * Cuando exista la credencial, se cambia solo esta función: verificar la ficha de Acceso
 * ("<usuario>.<vence>.<firma>", HMAC-SHA256 de "movil|<usuario>|<vence>", ACCESO-MOVIL.md 3.5) y buscar el usuario.
 */
export async function personaDeDispositivo(req: Request): Promise<Usuario> {
  const produccion = process.env.NODE_ENV === "production";
  const login = usuarioDeTokenDePrueba(req.headers.get("authorization"), env().MOVIL_PRUEBA_TOKEN, produccion);
  if (!login) throw new NoAutorizado(401, SIN_CREDENCIAL);
  const valido = usuarioSchema.safeParse(login);
  if (!valido.success) throw new NoAutorizado(401, SIN_CREDENCIAL);
  const db = await getDb();
  const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, valido.data));
  if (!u || !u.activo) throw new NoAutorizado(401, SIN_CREDENCIAL);
  return { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, odooPartnerId: u.odooPartnerId, permisosOff: u.permisosOff ?? [], tema: u.tema };
}
