import { z } from "zod";
import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { quitarRepuestoComo } from "@/lib/verificar-servicio";

const id = z.coerce.number().int().positive();

export const DELETE = manejar(async (_req, ctx: RouteContext<"/api/ordenes/[id]/repuestos/[lineaId]">) => {
  const u = await exigir("ordenes.editar");
  const p = await ctx.params;
  return json({ lineas: await quitarRepuestoComo(id.parse(p.id), id.parse(p.lineaId), u) });
});
