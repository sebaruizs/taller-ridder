import { z } from "zod";
import { exigir, registrar } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { odoo } from "@/lib/odoo";
import { iniciarOrden } from "@/lib/tablero";
import { avisarEntradaEnProceso, despuesDeResponder } from "@/lib/avisos";

export const POST = manejar(async (_req, ctx: RouteContext<"/api/ordenes/[id]/iniciar">) => {
  const u = await exigir("ordenes.mover_estado");
  const ordenId = z.coerce.number().int().positive().parse((await ctx.params).id);
  const r = await iniciarOrden(odoo, ordenId, u.nombre, u.odooPartnerId);
  await registrar(u.id, "orden.cambiar_estado", { ordenId, detalle: { chapa: r.chapa, de: "new", a: "running", aviso: r.aviso } });
  await despuesDeResponder(() => avisarEntradaEnProceso({ ordenId, de: "new", mecanicoPartnerId: r.mecanicoPartnerId, autorId: u.id }));
  return json({ chapa: r.chapa, aviso: r.aviso });
});
