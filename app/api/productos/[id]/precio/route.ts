import { z } from "zod";
import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { cambiarPrecioComo } from "@/lib/producto-servicio";

const body = z.object({
  precio: z.number({ error: "Ingresá el precio" }).min(0, "El precio no puede ser negativo").max(1_000_000_000, "Precio fuera de rango"),
});

export const PATCH = manejar(async (req, ctx: RouteContext<"/api/productos/[id]/precio">) => {
  const u = await exigir("inventario.editar_precio");
  const id = z.coerce.number().int().positive().parse((await ctx.params).id);
  const { precio } = body.parse(await req.json());
  return json(await cambiarPrecioComo(id, Math.round(precio), u));
});
