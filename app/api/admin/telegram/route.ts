import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { diagnosticoTelegram } from "@/lib/telegram";

// Para el admin: abrir /api/admin/telegram muestra qué bot está configurado y si está en los grupos.
export const GET = manejar(async () => {
  await exigir("usuarios.gestionar");
  return json(await diagnosticoTelegram());
});
