import { z } from "zod";
import { exigir } from "@/lib/auth";
import { errorJson, json, manejar } from "@/lib/api";
import { detalleOrden } from "@/lib/ordenes";
import { puede } from "@/lib/permisos";

const id = z.coerce.number().int().positive();

export const GET = manejar(async (_req, ctx: RouteContext<"/api/ordenes/[id]">) => {
  const u = await exigir("ordenes.ver_detalle");
  const orden = await detalleOrden(id.parse((await ctx.params).id));
  if (!orden) return errorJson("Orden no encontrada", 404);
  if (orden.estado !== "running" && !puede(u.rol, "ordenes.ver_todas")) return errorJson("Orden no encontrada", 404);
  return json({ orden });
});
