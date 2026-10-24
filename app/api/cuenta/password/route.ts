import { z } from "zod";
import { cambiarPassword, NoAutorizado, usuarioActual } from "@/lib/auth";
import { errorJson, json, manejar } from "@/lib/api";
import { passwordSchema } from "@/lib/credenciales";

const body = z.object({ actual: z.string().min(1, "Ingresá tu contraseña actual"), nueva: passwordSchema });

export const POST = manejar(async (req) => {
  const u = await usuarioActual();
  if (!u) throw new NoAutorizado(401);
  const { actual, nueva } = body.parse(await req.json());
  const error = await cambiarPassword(u.id, actual, nueva);
  if (error) return errorJson(error, 400);
  return json({ ok: true });
});
