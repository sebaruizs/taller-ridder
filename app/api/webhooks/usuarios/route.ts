import { json, manejar } from "@/lib/api";
import { altaCobranzasSchema, crearCobradorDesdeCobranzas } from "@/lib/usuarios";
import { autorizarCobranzas } from "@/lib/webhook-cobranzas";

// Cobranzas avisa cada usuario nuevo: se crea acá como cobrador con el mismo usuario y contraseña.
export const POST = manejar(async (req) => {
  const origen = autorizarCobranzas(req);
  const r = await crearCobradorDesdeCobranzas(altaCobranzasSchema.parse(await req.json().catch(() => ({}))), origen);
  return json(r, r.creado ? 201 : 200);
});
