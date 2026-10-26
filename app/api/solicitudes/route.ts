import { z } from "zod";
import { exigir } from "@/lib/auth";
import { errorJson, json, manejar } from "@/lib/api";
import { leerFotos } from "@/lib/fotos-form";
import { crearSolicitud } from "@/lib/solicitudes";

const campos = z.object({
  clave: z.string().uuid("Clave de envío inválida"),
  vehiculoId: z.coerce.number({ error: "Elegí la moto" }).int().positive("Elegí la moto"),
  tipoId: z.coerce.number({ error: "Elegí el tipo de trabajo" }).int().positive("Elegí el tipo de trabajo"),
  odometro: z.coerce.number({ error: "Ingresá el odómetro" }).positive("Ingresá el odómetro").max(2_000_000, "Odómetro fuera de rango"),
  observacion: z.string().trim().min(3, "Contá qué trabajo hiciste").max(4000),
});

export const POST = manejar(async (req) => {
  const u = await exigir("solicitudes.crear");
  const form = await req.formData();
  const datos = campos.parse({
    clave: form.get("clave"),
    vehiculoId: form.get("vehiculoId"),
    tipoId: form.get("tipoId"),
    odometro: form.get("odometro"),
    observacion: form.get("observacion") ?? "",
  });
  const leidas = await leerFotos(form, `solicitud-${datos.vehiculoId}`);
  if ("error" in leidas) return errorJson(leidas.error, 400);
  return json(await crearSolicitud(datos, leidas.fotos, u), 201);
});
