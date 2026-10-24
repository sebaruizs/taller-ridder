import { z } from "zod";
import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { recibirCompraComo } from "@/lib/compra-servicio";

export const POST = manejar(async (_req, ctx: RouteContext<"/api/compras/[id]/recibir">) => {
  const u = await exigir("compras.crear");
  const id = z.coerce.number().int().positive().parse((await ctx.params).id);
  return json(await recibirCompraComo(id, u));
});
