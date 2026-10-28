import { z } from "zod";
import { exigir } from "@/lib/auth";
import { errorJson, json, manejar } from "@/lib/api";
import { detalleOrden } from "@/lib/ordenes";
import { puedeAlguna, puedeU } from "@/lib/permisos";
import { reporteDeOrden } from "@/lib/reportes";
import { leerRepuestos } from "@/lib/verificar";
import { leerHistorial } from "@/lib/historial";
import { odoo } from "@/lib/odoo";

const id = z.coerce.number().int().positive();

export const GET = manejar(async (_req, ctx: RouteContext<"/api/ordenes/[id]">) => {
  const u = await exigir(["ordenes.ver_detalle", "ordenes.ver_todas", "ordenes.aprobar", "ordenes.editar"]);
  const orden = await detalleOrden(id.parse((await ctx.params).id));
  if (!orden) return errorJson("Orden no encontrada", 404);
  const visible =
    orden.estado === "running"
      ? puedeAlguna(u, ["ordenes.ver_detalle", "ordenes.ver_todas"])
      : orden.estado === "cancelled"
        ? puedeAlguna(u, ["ordenes.ver_todas", "ordenes.aprobar", "ordenes.editar"])
        : puedeU(u, "ordenes.ver_todas");
  if (!visible) return errorJson("Orden no encontrada", 404);
  // Lo mismo que muestra el detalle en la web. Las fotos se piden aparte: /api/fotos/<id>.
  const [reporte, repuestos, historial] = await Promise.all([
    reporteDeOrden(orden.id, orden.mecanico),
    leerRepuestos(odoo, orden.id),
    leerHistorial(orden.id).catch(() => null),
  ]);
  return json({ orden, reporte, repuestos, historial });
});
