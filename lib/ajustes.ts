import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { registrar, type Usuario } from "./auth";
import { CLAVE_COLORES, leerColores, type ColoresReporte } from "./ajustes-dominio";

export async function coloresReporte(): Promise<ColoresReporte> {
  const db = await getDb();
  const [fila] = await db.select().from(schema.config).where(eq(schema.config.clave, CLAVE_COLORES));
  return leerColores(fila?.valor);
}

export async function guardarColoresReporte(c: ColoresReporte, u: Usuario): Promise<void> {
  const db = await getDb();
  const antes = await coloresReporte();
  await db.insert(schema.config).values({ clave: CLAVE_COLORES, valor: c }).onConflictDoUpdate({ target: schema.config.clave, set: { valor: c } });
  await registrar(u.id, "config.editar", { detalle: { clave: CLAVE_COLORES, antes, despues: c } });
}
