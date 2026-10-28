import { z } from "zod";
import { exigir, registrar } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { odoo } from "@/lib/odoo";
import { moverOrden } from "@/lib/tablero";

const ESTADO = z.enum(["new", "to_be_paid", "running", "cancelled", "done"]);
// de: el estado en que la vio quien la mueve; si cambió mientras tanto, 409.
const body = z.object({ de: ESTADO, a: ESTADO });

// Movimientos directos del tablero: Nuevo → En proceso y En proceso ↔ Bloqueado.
export const POST = manejar(async (req, ctx: RouteContext<"/api/ordenes/[id]/mover">) => {
  const u = await exigir("ordenes.mover_estado");
  const ordenId = z.coerce.number().int().positive().parse((await ctx.params).id);
  const { de, a } = body.parse(await req.json().catch(() => ({})));
  const r = await moverOrden(odoo, ordenId, de, a, u.nombre, u.odooPartnerId);
  await registrar(u.id, "orden.cambiar_estado", { ordenId, detalle: { chapa: r.chapa, de, a, aviso: r.aviso } });
  return json(r);
});
