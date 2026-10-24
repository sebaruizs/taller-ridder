import { z } from "zod";
import { login } from "@/lib/auth";
import { errorJson, json, manejar } from "@/lib/api";

const body = z.object({
  usuario: z.string().trim().toLowerCase().min(1, "Ingresá tu usuario").max(30),
  password: z.string().min(1, "Ingresá tu contraseña").max(200),
});

export const POST = manejar(async (req) => {
  const { usuario, password } = body.parse(await req.json());
  const r = await login(usuario, password);
  if (!r.ok) return errorJson(r.error, r.status);
  return json({ usuario: { nombre: r.usuario.nombre, rol: r.usuario.rol } });
});
