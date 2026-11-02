import { z } from "zod";
import { exigir, registrar } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { odoo } from "@/lib/odoo";
import { cambiarMecanico } from "@/lib/tablero";
import { mecanicosOdoo } from "@/lib/usuarios";
import { NoVerificable } from "@/lib/verificar";

const body = z.object({ mecanicoId: z.number().int().positive() });

// Corrige en Reportes qué mecánico hizo el trabajo. Queda en la auditoría y como nota en la orden.
export const POST = manejar(async (req, ctx: RouteContext<"/api/ordenes/[id]/mecanico">) => {
  const u = await exigir("reportes.cambiar_mecanico");
  const ordenId = z.coerce.number().int().positive().parse((await ctx.params).id);
  const { mecanicoId } = body.parse(await req.json().catch(() => ({})));
  const mecanico = (await mecanicosOdoo()).find((m) => m.id === mecanicoId);
  if (!mecanico) throw new NoVerificable("Ese contacto no es mecánico en Odoo");
  const r = await cambiarMecanico(odoo, ordenId, mecanico, u.nombre, u.odooPartnerId);
  await registrar(u.id, "orden.cambiar_mecanico", { ordenId, detalle: { chapa: r.chapa, de: r.de, a: r.a, aviso: r.aviso } });
  return json(r);
});
