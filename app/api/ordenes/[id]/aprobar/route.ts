import { z } from "zod";
import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { aprobarComo } from "@/lib/verificar-servicio";

const body = z.object({ confirmaSinRepuestos: z.boolean().default(false) });

export const POST = manejar(async (req, ctx: RouteContext<"/api/ordenes/[id]/aprobar">) => {
  const u = await exigir("ordenes.aprobar");
  const ordenId = z.coerce.number().int().positive().parse((await ctx.params).id);
  const { confirmaSinRepuestos } = body.parse(await req.json().catch(() => ({})));
  return json(await aprobarComo(ordenId, confirmaSinRepuestos, u));
});
