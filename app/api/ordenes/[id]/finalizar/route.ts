import { z } from "zod";
import { exigir } from "@/lib/auth";
import { errorJson, json, manejar } from "@/lib/api";
import { buscarFinalizacion, crearYEjecutar } from "@/lib/finalizar-servicio";
import { FinalizarError } from "@/lib/finalizar";
import { puede } from "@/lib/permisos";

const MAX_FOTOS = 12;
const MAX_BYTES_FOTO = 4 * 1024 * 1024;
const MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

  const archivos = form.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);
  if (archivos.length > MAX_FOTOS) return errorJson(`Máximo ${MAX_FOTOS} fotos`, 400);
  const fotos = [];
  for (const [i, f] of archivos.entries()) {
    if (!MIMES.has(f.type)) return errorJson("Solo se aceptan fotos JPG, PNG o WEBP", 400);
    if (f.size > MAX_BYTES_FOTO) return errorJson("Una de las fotos es demasiado grande", 400);
    const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
    fotos.push({ nombre: `orden-${ordenId}-foto-${i + 1}.${ext}`, mimetype: f.type, datos: Buffer.from(await f.arrayBuffer()) });
  }

  try {
    const resumen = await crearYEjecutar({ ...datos, ordenId, fotos }, u);
    return json({ resumen });
  } catch (e) {
    if (e instanceof FinalizarError) {
      const status = e.paso === "validacion" ? 409 : e.paso === "lectura" ? 404 : 502;
      return errorJson(e.message, status, { paso: e.paso, clave: datos.clave, reintentable: status === 502 });
    }
    throw e;
  }
});
