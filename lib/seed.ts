import { hash } from "@node-rs/argon2";
import { sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { passwordSchema, usuarioSchema } from "./credenciales";

// Crea el primer admin desde ADMIN_USER / ADMIN_PASSWORD si la tabla de usuarios está vacía.
export async function seedAdmin(): Promise<string> {
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.usuarios);
  if (n > 0) return "ya hay usuarios, no se crea admin";
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) return "faltan ADMIN_USER / ADMIN_PASSWORD, no se crea admin";
  const usuario = usuarioSchema.parse(process.env.ADMIN_USER);
  const password = passwordSchema.parse(process.env.ADMIN_PASSWORD);
  const nombre = process.env.ADMIN_NOMBRE?.trim() || "Administrador";
  const filas = await db
    .insert(schema.usuarios)
    .values({ usuario, nombre, rol: "admin", passwordHash: await hash(password) })
    .onConflictDoNothing()
    .returning({ id: schema.usuarios.id });
  return filas.length ? `admin "${usuario}" creado` : "el admin ya existía";
}
