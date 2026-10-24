import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { crearSchema, crearUsuario, listarUsuarios } from "@/lib/usuarios";

export const GET = manejar(async () => {
  await exigir("usuarios.gestionar");
  return json({ usuarios: await listarUsuarios() });
});

export const POST = manejar(async (req) => {
  const autor = await exigir("usuarios.gestionar");
  const id = await crearUsuario(crearSchema.parse(await req.json()), autor);
  return json({ id }, 201);
});
