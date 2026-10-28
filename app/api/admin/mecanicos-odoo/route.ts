import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { ejecutivosOdoo, mecanicosOdoo } from "@/lib/usuarios";

export const GET = manejar(async () => {
  await exigir("usuarios.gestionar");
  // contactos: etiqueta «mecanico»; ejecutivos: etiqueta «ejecutivo» (para cobradores).
  const [contactos, ejecutivos] = await Promise.all([mecanicosOdoo(), ejecutivosOdoo()]);
  return json({ contactos, ejecutivos });
});
