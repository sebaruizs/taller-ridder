import { NoAutorizado } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { personaDeDispositivo } from "@/lib/movil-auth";
import { vehiculosADevolver } from "@/lib/movil";
import { puedeU } from "@/lib/permisos";

// Ridder App: las motos que pueden volver, para la Devolución sin señal. Odoo no guarda el motivo: va en null.
export const GET = manejar(async (req) => {
  const u = await personaDeDispositivo(req);
  if (!puedeU(u, "devoluciones.registrar")) throw new NoAutorizado(403);
  return json(await vehiculosADevolver());
});
