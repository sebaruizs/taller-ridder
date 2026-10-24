import { z } from "zod";
import { exigir } from "@/lib/auth";
import { errorJson, json, manejar } from "@/lib/api";
import { buscarFinalizacion } from "@/lib/finalizar-servicio";
import { puedeU } from "@/lib/permisos";

export const GET = manejar(async (_req, ctx: RouteContext<"/api/finalizaciones/[clave]">) => {
  const u = await exigir("ordenes.finalizar");
  const clave = z.string().uuid().parse((await ctx.params).clave);
  const fin = await buscarFinalizacion(clave);
  if (!fin || (fin.usuarioId !== u.id && !puedeU(u, "finalizaciones.ver_ajenas"))) return errorJson("No encontrada", 404);
  return json({
    finalizacion: {
      ordenId: fin.ordenId,
      pasos: { campos: fin.camposOk, fotos: fin.fotosOk, nota: fin.notaOk, estado: fin.estadoOk, telegram: fin.telegramOk },
      error: fin.error,
      intentos: fin.intentos,
      terminado: fin.terminado,
      resumen: fin.resumen,
    },
  });
});
