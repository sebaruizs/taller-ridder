import { NoAutorizado } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { personaDeDispositivo } from "@/lib/movil-auth";
import { tareasDe } from "@/lib/movil";
import { puedeU } from "@/lib/permisos";

// Ridder App: las tareas del mecánico para trabajar sin señal (ridder-app/contratos/SINCRONIZACION.md, sección 3).
export const GET = manejar(async (req) => {
  const u = await personaDeDispositivo(req);
  if (!puedeU(u, "ordenes.ver_en_proceso")) throw new NoAutorizado(403);
  return json(await tareasDe(u));
});
