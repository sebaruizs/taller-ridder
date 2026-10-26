import { z } from "zod";
import { NoAutorizado, exigir } from "@/lib/auth";
import { errorJson, manejar } from "@/lib/api";
import { puedeU } from "@/lib/permisos";
import { fotoSolicitud } from "@/lib/solicitudes";

// Fotos de una solicitud pendiente: las ve quien la hizo y quien aprueba.
export const GET = manejar(async (_req, ctx: RouteContext<"/api/solicitudes/fotos/[fotoId]">) => {
  const u = await exigir(["solicitudes.crear", "solicitudes.aprobar"]);
  const id = z.coerce.number().int().positive().parse((await ctx.params).fotoId);
  const f = await fotoSolicitud(id);
  if (!f) return errorJson("Foto no encontrada", 404);
  if (f.usuarioId !== u.id && !puedeU(u, "solicitudes.aprobar")) throw new NoAutorizado(403);
  return new Response(new Uint8Array(f.datos), { headers: { "Content-Type": f.mimetype, "Cache-Control": "private, max-age=86400" } });
});
