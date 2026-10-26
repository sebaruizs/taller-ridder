import { z } from "zod";
import { exigir } from "@/lib/auth";
import { errorJson, json, manejar } from "@/lib/api";
import { OrdenDuplicada } from "@/lib/crear-orden";
import { FinalizarError } from "@/lib/finalizar";
import { aprobarSolicitud } from "@/lib/solicitudes";

// destino: id de una orden abierta de la moto, o "nueva" para crear una.
const cuerpo = z.object({ destino: z.union([z.literal("nueva"), z.number().int().positive()]) });

export const POST = manejar(async (req, ctx: RouteContext<"/api/solicitudes/[id]/aprobar">) => {
  const u = await exigir("solicitudes.aprobar");
  const id = z.coerce.number().int().positive().parse((await ctx.params).id);
  const { destino } = cuerpo.parse(await req.json());
  try {
    return json(await aprobarSolicitud(id, destino, u));
  } catch (e) {
    if (e instanceof OrdenDuplicada) return errorJson("Esta moto ya tiene una orden abierta: elegí reportar sobre esa.", 409, { existentes: e.existentes });
    if (e instanceof FinalizarError) return errorJson(`Quedó aprobada, pero falló el reporte en Odoo (${e.message}). Tocá Reintentar: sigue desde donde quedó.`, 502, { reintentable: true });
    throw e;
  }
});
