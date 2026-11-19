import { z } from "zod";
import { exigir } from "@/lib/auth";
import { errorJson, json, manejar } from "@/lib/api";
import { cambiarNombreComo } from "@/lib/producto-servicio";
import { esquemaNombre } from "@/lib/cambiar-nombre";
import { ProductoDuplicado } from "@/lib/crear-producto";

const body = z.object({ nombre: esquemaNombre });

export const PATCH = manejar(async (req, ctx: RouteContext<"/api/productos/[id]/nombre">) => {
  const u = await exigir("inventario.editar_nombre");
  const id = z.coerce.number().int().positive().parse((await ctx.params).id);
  const { nombre } = body.parse(await req.json());
  try {
    return json(await cambiarNombreComo(id, nombre, u));
  } catch (e) {
    if (e instanceof ProductoDuplicado) return errorJson("Ya existe otro producto con ese nombre", 409, { existentes: e.existentes });
    throw e;
  }
});
