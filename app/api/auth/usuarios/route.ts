import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { json, manejar } from "@/lib/api";

export const GET = manejar(async () => {
  const db = await getDb();
  const usuarios = await db
    .select({ id: schema.usuarios.id, nombre: schema.usuarios.nombre })
    .from(schema.usuarios)
    .where(eq(schema.usuarios.activo, true))
    .orderBy(asc(schema.usuarios.nombre));
  return json({ usuarios });
});
