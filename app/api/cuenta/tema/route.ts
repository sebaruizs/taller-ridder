import { z } from "zod";
import { eq } from "drizzle-orm";
import { NoAutorizado, registrar, usuarioActual } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { TEMAS } from "@/lib/db/schema";

const body = z.object({ tema: z.enum(TEMAS, { error: "Tema inválido" }) });

export const POST = manejar(async (req) => {
  const u = await usuarioActual();
  if (!u) throw new NoAutorizado(401);
  const { tema } = body.parse(await req.json());
  const db = await getDb();
  await db.update(schema.usuarios).set({ tema }).where(eq(schema.usuarios.id, u.id));
  await registrar(u.id, "cuenta.tema", { detalle: { de: u.tema, a: tema } });
  return json({ ok: true });
});
