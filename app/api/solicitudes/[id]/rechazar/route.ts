import { z } from "zod";
import { exigir } from "@/lib/auth";
import { json, manejar } from "@/lib/api";
import { rechazarSolicitud } from "@/lib/solicitudes";

const cuerpo = z.object({ motivo: z.string().trim().min(3, "Escribí por qué la rechazás").max(500) });

export const POST = manejar(async (req, ctx: RouteContext<"/api/solicitudes/[id]/rechazar">) => {
  const u = await exigir("solicitudes.aprobar");
  const id = z.coerce.number().int().positive().parse((await ctx.params).id);
  const { motivo } = cuerpo.parse(await req.json());
  await rechazarSolicitud(id, motivo, u);
  return json({ ok: true });
});
