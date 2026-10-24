import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { mecanicosOdoo } from "@/lib/usuarios";

export const GET = manejar(async () => {
  await exigir("usuarios.gestionar");
  return json({ contactos: await mecanicosOdoo() });
});
