import { z } from "zod";
import { exigir } from "@/lib/auth";
import { errorJson, json, manejar } from "@/lib/api";
import { buscarFinalizacion, crearYEjecutar } from "@/lib/finalizar-servicio";
import { FinalizarError } from "@/lib/finalizar";
import { puede } from "@/lib/permisos";
import { leerFotos } from "@/lib/fotos-form";

const campos = z.object({
  clave: z.string().uuid("Clave de envío inválida"),
  odometro: z.coerce.number({ error: "Ingresá el odómetro" }).positive("Ingresá el odómetro").max(2_000_000, "Odómetro fuera de rango"),
  observacion: z.string().max(4000).default(""),
  listaEntrega: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export const POST = manejar(async (req, ctx: RouteContext<"/api/ordenes/[id]/finalizar">) => {
  const u = await exigir("ordenes.finalizar");
  const ordenId = z.coerce.number().int().positive().parse((await ctx.params).id);
  const form = await req.formData();
  const datos = campos.parse({
    clave: form.get("clave"),
    odometro: form.get("odometro"),
    observacion: form.get("observacion") ?? "",
    listaEntrega: form.get("listaEntrega"),
  });

  const previa = await buscarFinalizacion(datos.clave);
  if (previa && previa.usuarioId !== u.id && !puede(u.rol, "finalizaciones.ver_ajenas")) {
    return errorJson("No tenés permiso para esto", 403);
  }

  const leidas = await leerFotos(form, `orden-${ordenId}`);
  if ("error" in leidas) return errorJson(leidas.error, 400);

  try {
    const resumen = await crearYEjecutar({ ...datos, ordenId, fotos: leidas.fotos }, u);
    return json({ resumen });
  } catch (e) {
    if (e instanceof FinalizarError) {
      const status = e.paso === "validacion" ? 409 : e.paso === "lectura" ? 404 : 502;
      return errorJson(e.message, status, { paso: e.paso, clave: datos.clave, reintentable: status === 502 });
    }
    throw e;
  }
});
