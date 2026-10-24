import { z } from "zod";
import { login } from "@/lib/auth";
import { errorJson, json, manejar } from "@/lib/api";
import { pinSchema } from "@/lib/pin";

const body = z.object({ usuarioId: z.number().int().positive(), pin: pinSchema });

export const POST = manejar(async (req) => {
  const { usuarioId, pin } = body.parse(await req.json());
  const r = await login(usuarioId, pin);
  if (!r.ok) return errorJson(r.error, r.status);
  return json({ usuario: { nombre: r.usuario.nombre, rol: r.usuario.rol } });
});
