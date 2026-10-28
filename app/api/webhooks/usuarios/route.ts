import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { errorJson, json, manejar } from "@/lib/api";
import { altaCobranzasSchema, crearCobradorDesdeCobranzas } from "@/lib/usuarios";

// Cobranzas avisa cada usuario nuevo: se crea acá como cobrador con el mismo usuario y contraseña.
// Autenticación: header Authorization "Bearer <WEBHOOK_USUARIOS_SECRET>".
const resumen = (v: string) => createHash("sha256").update(v).digest();

export const POST = manejar(async (req) => {
  const secreto = env().WEBHOOK_USUARIOS_SECRET;
  if (!secreto) return errorJson("Webhook no habilitado", 404);
  const recibido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!timingSafeEqual(resumen(recibido), resumen(secreto))) return errorJson("No autorizado", 401);
  const r = await crearCobradorDesdeCobranzas(altaCobranzasSchema.parse(await req.json()));
  return json(r, r.creado ? 201 : 200);
});
