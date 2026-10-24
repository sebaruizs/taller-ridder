import { z } from "zod";
import { exigir } from "@/lib/auth";
import { errorJson, json, manejar } from "@/lib/api";
import { buscarFinalizacion, ejecutar } from "@/lib/finalizar-servicio";
import { FinalizarError } from "@/lib/finalizar";
import { puede } from "@/lib/permisos";

export const POST = manejar(async (_req, ctx: RouteContext<"/api/finalizaciones/[clave]/reintentar">) => {
  const u = await exigir("ordenes.finalizar");
  const clave = z.string().uuid().parse((await ctx.params).clave);
  const fin = await buscarFinalizacion(clave);
  if (!fin || (fin.usuarioId !== u.id && !puede(u.rol, "finalizaciones.ver_ajenas"))) return errorJson("No encontrada", 404);
  try {
    return json({ resumen: await ejecutar(clave, u) });
  } catch (e) {
    if (e instanceof FinalizarError) {
      const status = e.paso === "validacion" ? 409 : 502;
      return errorJson(e.message, status, { paso: e.paso, clave, reintentable: status === 502 });
    }
    throw e;
  }
});
