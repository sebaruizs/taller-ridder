import { z } from "zod";
import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { borrarDevolucion } from "@/lib/devoluciones";

// Borra la devolución con sus fotos (solo admin). Queda en el registro de acciones.
export const DELETE = manejar(async (_req, ctx: RouteContext<"/api/devoluciones/[id]">) => {
  const u = await exigir("devoluciones.borrar");
  const id = z.coerce.number().int().positive().parse((await ctx.params).id);
  return json(await borrarDevolucion(id, u));
});
