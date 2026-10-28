import { z } from "zod";
import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { editarRepuestoComo, quitarRepuestoComo } from "@/lib/verificar-servicio";

const id = z.coerce.number().int().positive();

export const DELETE = manejar(async (_req, ctx: RouteContext<"/api/ordenes/[id]/repuestos/[lineaId]">) => {
  const u = await exigir("ordenes.editar");
  const p = await ctx.params;
  return json({ lineas: await quitarRepuestoComo(id.parse(p.id), id.parse(p.lineaId), u) });
});

const cambio = z.object({
  cantidad: z.number().positive("La cantidad tiene que ser mayor a 0").max(1000),
  costoUnitario: z.number().min(0, "El costo no puede ser negativo").max(100_000_000),
});

// Editar la fila: cantidad y costo unitario.
export const PATCH = manejar(async (req, ctx: RouteContext<"/api/ordenes/[id]/repuestos/[lineaId]">) => {
  const u = await exigir("ordenes.editar");
  const p = await ctx.params;
  return json({ lineas: await editarRepuestoComo(id.parse(p.id), id.parse(p.lineaId), cambio.parse(await req.json().catch(() => ({}))), u) });
});
