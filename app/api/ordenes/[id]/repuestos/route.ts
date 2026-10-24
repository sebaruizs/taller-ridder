import { z } from "zod";
import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { odoo } from "@/lib/odoo";
import { leerRepuestos } from "@/lib/verificar";
import { agregarRepuestoComo } from "@/lib/verificar-servicio";

const id = z.coerce.number().int().positive();

export const GET = manejar(async (_req, ctx: RouteContext<"/api/ordenes/[id]/repuestos">) => {
  await exigir("ordenes.editar");
  return json({ lineas: await leerRepuestos(odoo, id.parse((await ctx.params).id)) });
});

const body = z.object({
  productoId: z.number().int().positive("Elegí el repuesto"),
  cantidad: z.number().positive("La cantidad tiene que ser mayor a 0").max(1000),
  costoUnitario: z.number().min(0, "El costo no puede ser negativo").max(100_000_000),
});

export const POST = manejar(async (req, ctx: RouteContext<"/api/ordenes/[id]/repuestos">) => {
  const u = await exigir("ordenes.editar");
  const ordenId = id.parse((await ctx.params).id);
  const lineas = await agregarRepuestoComo(ordenId, body.parse(await req.json()), u);
  return json({ lineas }, 201);
});
