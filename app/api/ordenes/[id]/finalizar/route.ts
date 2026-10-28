import { z } from "zod";
import { exigir } from "@/lib/auth";
import { errorJson, json, manejar } from "@/lib/api";
import { buscarFinalizacion, crearYEjecutar } from "@/lib/finalizar-servicio";
import { FinalizarError } from "@/lib/finalizar";
import { puedeU } from "@/lib/permisos";
import { leerFotos } from "@/lib/fotos-form";

const campos = z.object({
  clave: z.string().uuid("Clave de envío inválida"),
  // 0 vale (moto sin odómetro o que no marca), pero el campo no puede quedar vacío.
  odometro: z
    .string({ error: "Ingresá el odómetro" })
    .trim()
    .min(1, "Ingresá el odómetro (0 si la moto no tiene)")
    .transform(Number)
    .pipe(z.number({ error: "Ingresá el odómetro" }).min(0, "El odómetro no puede ser negativo").max(2_000_000, "Odómetro fuera de rango")),
  observacion: z.string().max(4000).default(""),
});

export const POST = manejar(async (req, ctx: RouteContext<"/api/ordenes/[id]/finalizar">) => {
  const u = await exigir("ordenes.finalizar");
  const ordenId = z.coerce.number().int().positive().parse((await ctx.params).id);
  const form = await req.formData();
  const datos = campos.parse({
    clave: form.get("clave"),
    odometro: form.get("odometro"),
    observacion: form.get("observacion") ?? "",
  });

  const previa = await buscarFinalizacion(datos.clave);
  if (previa && previa.usuarioId !== u.id && !puedeU(u, "finalizaciones.ver_ajenas")) {
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
