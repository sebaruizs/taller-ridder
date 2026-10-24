import { hash } from "@node-rs/argon2";
import { sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { pinSchema } from "./pin";

// Crea el primer admin desde ADMIN_NOMBRE / ADMIN_PIN si la tabla de usuarios está vacía.
export async function seedAdmin(): Promise<string> {
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.usuarios);
  if (n > 0) return "ya hay usuarios, no se crea admin";
  const nombre = process.env.ADMIN_NOMBRE?.trim();
  const pin = process.env.ADMIN_PIN?.trim();
  if (!nombre || !pin) return "faltan ADMIN_NOMBRE / ADMIN_PIN, no se crea admin";
  pinSchema.parse(pin);
  const partner = Number(process.env.ADMIN_ODOO_PARTNER_ID) || null;
  const filas = await db
    .insert(schema.usuarios)
    .values({ nombre, rol: "admin", pinHash: await hash(pin), odooPartnerId: partner })
    .onConflictDoNothing()
    .returning({ id: schema.usuarios.id });
  return filas.length ? `admin "${nombre}" creado` : "el admin ya existía";
}
